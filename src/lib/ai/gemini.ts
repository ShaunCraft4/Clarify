import { GoogleGenerativeAI, type Tool } from "@google/generative-ai";
import { llmQueue } from "./queue";
import {
  recordLlmCall,
  recordLlmRateLimit,
  assertCanCallLlm,
} from "./usage";

let _genAI: GoogleGenerativeAI | null = null;

function genAI() {
  if (!_genAI) {
    const key = process.env.GOOGLE_AI_API_KEY;
    if (!key) throw new Error("GOOGLE_AI_API_KEY is not set");
    _genAI = new GoogleGenerativeAI(key);
  }
  return _genAI;
}

// gemini-2.0-flash has a zero free-tier quota on some projects; 2.5-flash is
// the current default and is available on the free tier.
const LLM_MODEL = "gemini-2.5-flash";
// text-embedding-004 has been retired for new keys; gemini-embedding-001 is
// the current model. We request 768 dims to match the vector(768) DB schema.
const EMBED_MODEL = "gemini-embedding-001";
const EMBED_DIM = 768;

const MAX_RETRIES = 1;

/** Pull a retry delay (seconds) out of a Gemini 429 error message, if present. */
function parseRetryDelayMs(message: string): number | null {
  const m =
    message.match(/retry in ([\d.]+)s/i) ||
    message.match(/"retryDelay":\s*"(\d+)s"/);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : null;
}

function isRateLimitError(msg: string): boolean {
  return (
    msg.includes("429") ||
    /rate limit|quota exceeded|resource exhausted/i.test(msg)
  );
}

/** Fail fast instead of hanging on slow grounded / large prompts. */
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)
          ),
        ms
      )
    ),
  ]);
}

/**
 * Run a Gemini call through the rate-limit queue.
 * - Never retries 429 (retrying makes Google block you longer).
 * - Only retries once on transient 503/overloaded.
 */
async function withRetry<T>(task: () => Promise<T>): Promise<T> {
  assertCanCallLlm();

  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await llmQueue.run(async () => {
        assertCanCallLlm();
        const result = await task();
        recordLlmCall();
        return result;
      });
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = isRateLimitError(msg);
      const isOverloaded = msg.includes("503") || msg.includes("overloaded");

      if (isRateLimit) {
        recordLlmRateLimit(parseRetryDelayMs(msg) ?? undefined);
        break;
      }

      if (!isOverloaded || attempt === MAX_RETRIES) break;
      await new Promise((r) =>
        setTimeout(r, Math.min(3000 * 2 ** attempt, 12_000) + 250)
      );
    }
  }

  const finalMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  if (finalMsg.includes("503") || finalMsg.includes("overloaded")) {
    throw new Error(
      "The AI is under heavy demand right now. Please try again in a little while."
    );
  }
  if (isRateLimitError(finalMsg)) {
    const retryMs = parseRetryDelayMs(finalMsg);
    const waitHint = retryMs
      ? ` Wait about ${Math.ceil(retryMs / 1000)} seconds, then try again.`
      : " Wait about a minute, then try again.";
    throw new Error(
      `You've hit the Gemini free-tier limit.${waitHint} Uploading materials, search, and notes all share the same quota — try spacing out AI actions, or enable billing on your Google AI project for higher limits.`
    );
  }
  throw lastErr;
}

/** Max raw PDF size we send inline for OCR (base64 inflates ~33%; API inline
 * request cap is ~20MB). */
const MAX_OCR_BYTES = 14 * 1024 * 1024;

/**
 * OCR / transcribe a (typically scanned) PDF using Gemini's multimodal vision.
 * This handles image-only PDFs that have no embedded text layer, without
 * needing native OCR binaries.
 */
export async function ocrPdf(buffer: Buffer): Promise<string> {
  if (buffer.length > MAX_OCR_BYTES) {
    throw new Error(
      "This scanned PDF is too large to OCR automatically (max ~14MB). Try splitting it into smaller files."
    );
  }

  const model = genAI().getGenerativeModel({ model: LLM_MODEL });
  const base64 = buffer.toString("base64");

  return withRetry(async () => {
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: { data: base64, mimeType: "application/pdf" },
            },
            {
              text: "Transcribe ALL text from this document exactly, page by page, in natural reading order. Preserve headings, lists, and tables as plain text. Do not summarize, translate, or add commentary — output only the transcribed text.",
            },
          ],
        },
      ],
    });
    return result.response.text().trim();
  });
}

/** Free-form text generation. */
export async function generateText(
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  const model = genAI().getGenerativeModel({
    model: LLM_MODEL,
    ...(systemInstruction ? { systemInstruction } : {}),
  });

  return withRetry(async () => {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    return result.response.text();
  });
}

/**
 * Text generation with live web grounding (Google Search). Lets Gemini pull in
 * up-to-date information from the internet for topics the student doesn't have
 * materials for. If the grounding tool isn't available on the current key/model,
 * we transparently fall back to the model's built-in knowledge.
 */
export async function generateGroundedText(
  prompt: string,
  systemInstruction?: string
): Promise<string> {
  // `googleSearch` is the grounding tool for Gemini 2.0+; the SDK's types lag
  // behind the API, so we cast the tool definition.
  const tools = [{ googleSearch: {} }] as unknown as Tool[];
  const model = genAI().getGenerativeModel({
    model: LLM_MODEL,
    tools,
    ...(systemInstruction ? { systemInstruction } : {}),
  });

  try {
    return await withTimeout(
      withRetry(async () => {
        const result = await model.generateContent({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
        });
        return result.response.text();
      }),
      22_000,
      "Web research"
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      isRateLimitError(msg) ||
      msg.includes("503") ||
      msg.includes("overloaded")
    ) {
      throw err;
    }
    // Grounding unavailable or too slow — fall back to standard generation.
    return generateText(prompt, systemInstruction);
  }
}

/**
 * Structured generation using Gemini's native JSON mode. Returns parsed JSON
 * of type T. Throws if the response isn't valid JSON.
 */
export async function generateJSON<T>(
  prompt: string,
  systemInstruction?: string
): Promise<T> {
  const model = genAI().getGenerativeModel({
    model: LLM_MODEL,
    systemInstruction:
      systemInstruction ??
      "You must respond with valid JSON only. No markdown, no explanation, no code fences.",
    generationConfig: { responseMimeType: "application/json" },
  });

  return withRetry(async () => {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    });
    const text = result.response.text();
    try {
      return JSON.parse(text) as T;
    } catch {
      // Best-effort recovery if the model wrapped output in fences.
      const cleaned = text
        .replace(/^```(?:json)?/i, "")
        .replace(/```$/, "")
        .trim();
      return JSON.parse(cleaned) as T;
    }
  });
}

export { genAI, EMBED_MODEL, EMBED_DIM };

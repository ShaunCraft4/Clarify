import { GoogleGenerativeAI } from "@google/generative-ai";
import { llmQueue } from "./queue";
import { recordLlmCall } from "./usage";

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

const MAX_RETRIES = 3;

/** Pull a retry delay (seconds) out of a Gemini 429 error message, if present. */
function parseRetryDelayMs(message: string): number | null {
  const m = message.match(/retry in ([\d.]+)s/i) || message.match(/"retryDelay":\s*"(\d+)s"/);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : null;
}

/**
 * Run a Gemini call through the rate-limit queue with automatic retry on
 * transient 429 (rate limit) / 503 (overloaded) responses.
 */
async function withRetry<T>(task: () => Promise<T>): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await llmQueue.run(async () => {
        recordLlmCall();
        return task();
      });
    } catch (err) {
      lastErr = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRateLimit = msg.includes("429");
      const isOverloaded = msg.includes("503") || msg.includes("overloaded");
      if ((!isRateLimit && !isOverloaded) || attempt === MAX_RETRIES) break;
      const delay =
        parseRetryDelayMs(msg) ?? Math.min(2000 * 2 ** attempt, 30000);
      await new Promise((r) => setTimeout(r, delay + 250));
    }
  }
  const finalMsg = lastErr instanceof Error ? lastErr.message : String(lastErr);
  if (finalMsg.includes("503") || finalMsg.includes("overloaded")) {
    throw new Error(
      "The AI is under heavy demand right now. Please try again in a little while."
    );
  }
  if (finalMsg.includes("429")) {
    throw new Error(
      "Gemini rate limit reached on the free tier. Wait a minute and try again (or enable billing on your Google AI project for higher limits)."
    );
  }
  throw lastErr;
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

import { embedQueue } from "./queue";
import { EMBED_MODEL, EMBED_DIM } from "./gemini";
import {
  recordEmbedCall,
  recordEmbedRateLimit,
  assertCanCallEmbed,
} from "./usage";

type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
/** Max texts per batchEmbedContents request (API allows more; keep payloads modest). */
const BATCH_SIZE = 20;

function parseRetryDelayMs(detail: string): number | undefined {
  const m = detail.match(/retry in ([\d.]+)s/i);
  return m ? Math.ceil(parseFloat(m[1]) * 1000) : undefined;
}

async function embedOne(text: string, taskType: EmbedTask): Promise<number[]> {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_AI_API_KEY is not set");

  const res = await fetch(
    `${ENDPOINT}/${EMBED_MODEL}:embedContent?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
        taskType,
        outputDimensionality: EMBED_DIM,
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 429) {
      recordEmbedRateLimit(parseRetryDelayMs(detail));
    }
    throw new Error(
      `Embedding request failed (${res.status}): ${detail.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as { embedding?: { values?: number[] } };
  const values = data.embedding?.values;
  if (!values?.length) {
    throw new Error("Embedding response contained no vector");
  }
  recordEmbedCall();
  return values;
}

async function embedBatch(
  texts: string[],
  taskType: EmbedTask
): Promise<number[][]> {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_AI_API_KEY is not set");

  const res = await fetch(
    `${ENDPOINT}/${EMBED_MODEL}:batchEmbedContents?key=${key}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: texts.map((text) => ({
          model: `models/${EMBED_MODEL}`,
          content: { parts: [{ text }] },
          taskType,
          outputDimensionality: EMBED_DIM,
        })),
      }),
    }
  );

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    if (res.status === 429) {
      recordEmbedRateLimit(parseRetryDelayMs(detail));
    }
    throw new Error(
      `Batch embedding failed (${res.status}): ${detail.slice(0, 300)}`
    );
  }

  const data = (await res.json()) as {
    embeddings?: { values?: number[] }[];
  };
  const vectors = (data.embeddings ?? []).map((e) => e.values).filter(Boolean);
  if (vectors.length !== texts.length) {
    throw new Error(
      `Batch embedding returned ${vectors.length}/${texts.length} vectors`
    );
  }
  recordEmbedCall(texts.length);
  return vectors as number[][];
}

export async function embed(
  text: string,
  taskType: EmbedTask
): Promise<number[]> {
  return embedQueue.run(async () => {
    assertCanCallEmbed();
    return embedOne(text, taskType);
  });
}

/** Embed many document chunks at upload time — batched to save API quota. */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);
    const vectors = await embedQueue.run(async () => {
      assertCanCallEmbed();
      return embedBatch(batch, "RETRIEVAL_DOCUMENT");
    });
    out.push(...vectors);
  }
  return out;
}

export function embedQuery(text: string): Promise<number[]> {
  return embed(text, "RETRIEVAL_QUERY");
}

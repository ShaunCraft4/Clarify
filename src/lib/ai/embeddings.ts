import { embedQueue } from "./queue";
import { EMBED_MODEL, EMBED_DIM } from "./gemini";

type EmbedTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

/**
 * Embed a single piece of text via the Generative Language REST API.
 * We call REST directly so we can pin `outputDimensionality` to 768 (the
 * gemini-embedding-001 default is larger) and keep the vector(768) schema.
 */
export async function embed(
  text: string,
  taskType: EmbedTask
): Promise<number[]> {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_AI_API_KEY is not set");

  return embedQueue.run(async () => {
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
      throw new Error(
        `Embedding request failed (${res.status}): ${detail.slice(0, 300)}`
      );
    }

    const data = (await res.json()) as { embedding?: { values?: number[] } };
    const values = data.embedding?.values;
    if (!values || values.length === 0) {
      throw new Error("Embedding response contained no vector");
    }
    return values;
  });
}

/** Embed many document chunks (used at upload time). */
export async function embedDocuments(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (const t of texts) {
    out.push(await embed(t, "RETRIEVAL_DOCUMENT"));
  }
  return out;
}

/** Embed a user query (used at search time). */
export function embedQuery(text: string): Promise<number[]> {
  return embed(text, "RETRIEVAL_QUERY");
}

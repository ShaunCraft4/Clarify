export interface TextChunk {
  content: string;
  index: number;
}

// text-embedding-004 works on tokens; we approximate ~4 chars per token.
const CHARS_PER_TOKEN = 4;
const CHUNK_TOKENS = 800;
const OVERLAP_TOKENS = 80;

const CHUNK_CHARS = CHUNK_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;

/**
 * Split text into ~400-token overlapping segments (50-token overlap), trying
 * to break on sentence/paragraph boundaries so chunks stay coherent.
 */
export function chunkText(raw: string): TextChunk[] {
  const text = raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!text) return [];

  const chunks: TextChunk[] = [];
  let start = 0;
  let index = 0;

  while (start < text.length) {
    let end = Math.min(start + CHUNK_CHARS, text.length);

    if (end < text.length) {
      // Prefer a natural boundary in the last ~20% of the window.
      const window = text.slice(start, end);
      const boundary = Math.max(
        window.lastIndexOf("\n\n"),
        window.lastIndexOf(". "),
        window.lastIndexOf("? "),
        window.lastIndexOf("! ")
      );
      if (boundary > CHUNK_CHARS * 0.5) {
        end = start + boundary + 1;
      }
    }

    const content = text.slice(start, end).trim();
    if (content) chunks.push({ content, index: index++ });

    if (end >= text.length) break;
    start = Math.max(end - OVERLAP_CHARS, start + 1);
  }

  return chunks;
}

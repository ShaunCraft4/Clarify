import type { SupabaseClient } from "@supabase/supabase-js";
import { embedQuery } from "@/lib/ai/embeddings";
import type { ChunkMatch } from "@/lib/types";

export interface RetrievedChunk extends ChunkMatch {
  materialName: string;
}

/**
 * Embed a query and run cosine-similarity vector search over a course's
 * chunks. RLS on the (user-scoped) client guarantees course isolation.
 */
export async function retrieve(
  supabase: SupabaseClient,
  courseId: string,
  query: string,
  matchCount = 5
): Promise<RetrievedChunk[]> {
  const queryEmbedding = await embedQuery(query);

  const { data, error } = await supabase.rpc("match_chunks", {
    p_course_id: courseId,
    query_embedding: queryEmbedding,
    match_count: matchCount,
  });
  if (error) throw error;

  const matches = (data ?? []) as ChunkMatch[];
  if (matches.length === 0) return [];

  const materialIds = [...new Set(matches.map((m) => m.material_id))];
  const { data: materials } = await supabase
    .from("materials")
    .select("id, file_name")
    .in("id", materialIds);

  const nameById = new Map<string, string>(
    (materials ?? []).map((m) => [m.id, m.file_name])
  );

  return matches.map((m) => ({
    ...m,
    materialName: nameById.get(m.material_id) ?? "Unknown",
  }));
}

/** Build a context block + citation list from retrieved chunks. */
export function buildContext(chunks: RetrievedChunk[]) {
  const context = chunks
    .map((c, i) => {
      const page = c.metadata?.page ? `, page ${c.metadata.page}` : "";
      return `[Source ${i + 1}: ${c.materialName}${page}]\n${c.content}`;
    })
    .join("\n\n---\n\n");

  const citations = chunks.map((c) => ({
    materialId: c.material_id,
    materialName: c.materialName,
    page: c.metadata?.page,
    chunkIndex: c.chunk_index,
    chunkId: c.id,
    excerpt: c.content,
  }));

  return { context, citations };
}

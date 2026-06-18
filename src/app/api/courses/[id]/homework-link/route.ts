import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import type { ChunkMatch } from "@/lib/types";

export const maxDuration = 60;

/**
 * Link a homework material's questions to the most relevant lecture passages.
 * Reuses the stored embeddings of the homework chunks (no re-embedding needed).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);
    const body = await req.json().catch(() => ({}));
    const materialId: string = (body.materialId ?? "").toString();
    if (!materialId) throw new ApiError(400, "materialId is required");

    const { data: hwChunks, error } = await supabase
      .from("chunks")
      .select("id, content, embedding, chunk_index")
      .eq("material_id", materialId)
      .order("chunk_index", { ascending: true })
      .limit(8);
    if (error) throw error;
    if (!hwChunks || hwChunks.length === 0) {
      throw new ApiError(400, "This material has no processed chunks yet.");
    }

    // Material names for display.
    const { data: materials } = await supabase
      .from("materials")
      .select("id, file_name");
    const nameById = new Map((materials ?? []).map((m) => [m.id, m.file_name]));

    const links = [];
    for (const hw of hwChunks) {
      const embedding =
        typeof hw.embedding === "string"
          ? JSON.parse(hw.embedding)
          : hw.embedding;
      if (!embedding) continue;

      const { data: matches } = await supabase.rpc("match_chunks", {
        p_course_id: id,
        query_embedding: embedding,
        match_count: 6,
      });

      const relevant = ((matches ?? []) as ChunkMatch[])
        .filter((m) => m.material_id !== materialId)
        .slice(0, 3)
        .map((m) => ({
          materialId: m.material_id,
          materialName: nameById.get(m.material_id) ?? "Unknown",
          excerpt: m.content.slice(0, 200),
          similarity: m.similarity,
        }));

      links.push({
        question: hw.content.slice(0, 300),
        chunkIndex: hw.chunk_index,
        relevant,
      });
    }

    return NextResponse.json({ links });
  });
}

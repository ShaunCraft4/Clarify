import type { SupabaseClient } from "@supabase/supabase-js";

const MAX_CHARS = 16000;

/**
 * Gather representative chunk text for a course (or a single material) to feed
 * into generation prompts. Caps total length to keep prompts within limits.
 */
export async function gatherCourseContent(
  supabase: SupabaseClient,
  courseId: string,
  materialId?: string
): Promise<string> {
  let query = supabase
    .from("chunks")
    .select("content, chunk_index, material_id")
    .eq("course_id", courseId)
    .order("chunk_index", { ascending: true })
    .limit(120);

  if (materialId) query = query.eq("material_id", materialId);

  const { data, error } = await query;
  if (error) throw error;
  if (!data || data.length === 0) return "";

  let total = 0;
  const parts: string[] = [];
  for (const row of data) {
    if (total + row.content.length > MAX_CHARS) break;
    parts.push(row.content);
    total += row.content.length;
  }
  return parts.join("\n\n");
}

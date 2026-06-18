import { createAdminClient } from "@/lib/supabase/admin";
import { extractPdfText, extractPlainText } from "@/lib/pdf";
import { chunkText } from "@/lib/ai/chunking";
import { embed } from "@/lib/ai/embeddings";
import type { FileType, MaterialStatus } from "@/lib/types";

const BUCKET = "materials";

async function setStatus(
  materialId: string,
  status: MaterialStatus,
  extra: Record<string, unknown> = {}
) {
  const admin = createAdminClient();
  await admin.from("materials").update({ status, ...extra }).eq("id", materialId);
}

/**
 * Background pipeline: download → extract text → chunk → embed → store.
 * Updates the material row's status at each step so the UI can poll progress.
 */
export async function processMaterial(params: {
  materialId: string;
  courseId: string;
  userId: string;
  storagePath: string;
  fileType: FileType;
}) {
  const { materialId, courseId, userId, storagePath, fileType } = params;
  const admin = createAdminClient();

  try {
    // 1. Extract text
    await setStatus(materialId, "extracting");
    const { data: file, error: dlErr } = await admin.storage
      .from(BUCKET)
      .download(storagePath);
    if (dlErr || !file) throw new Error("Could not download uploaded file");

    const buffer = Buffer.from(await file.arrayBuffer());
    const text =
      fileType === "notes"
        ? extractPlainText(buffer)
        : await extractPdfText(buffer);

    if (!text || text.length < 10) {
      throw new Error(
        "No extractable text found. If this is a scanned PDF, it needs OCR."
      );
    }

    // 2. Chunk
    await setStatus(materialId, "chunking", { extracted_text: text });
    const chunks = chunkText(text);
    if (chunks.length === 0) throw new Error("Text produced no chunks");

    // 3. Embed + store (sequential via the embed queue to respect rate limits)
    await setStatus(materialId, "embedding");
    const rows = [];
    for (const chunk of chunks) {
      const embedding = await embed(chunk.content, "RETRIEVAL_DOCUMENT");
      rows.push({
        material_id: materialId,
        course_id: courseId,
        user_id: userId,
        content: chunk.content,
        // pgvector expects the literal "[1,2,3]" text format, not a JS array
        // (PostgREST would otherwise serialise it as a Postgres array `{...}`).
        embedding: JSON.stringify(embedding),
        chunk_index: chunk.index,
        metadata: {},
      });
    }

    // Insert in batches to keep payloads reasonable.
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await admin.from("chunks").insert(batch);
      if (error) throw error;
    }

    // 4. Done
    await setStatus(materialId, "done", { chunk_count: rows.length });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    console.error(`[pipeline] material ${materialId} failed:`, err);
    await setStatus(materialId, "error", { error: message });
  }
}

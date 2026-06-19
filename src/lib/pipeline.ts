import { createAdminClient } from "@/lib/supabase/admin";
import { extractPdfText, extractPlainText } from "@/lib/pdf";
import { chunkText } from "@/lib/ai/chunking";
import { embedDocuments } from "@/lib/ai/embeddings";
import { ocrPdf } from "@/lib/ai/gemini";
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
 * Chunk → embed → store a block of text against a material, updating status as
 * it goes. Shared by file uploads and AI-generated topic materials.
 */
async function embedAndStore(
  materialId: string,
  courseId: string,
  userId: string,
  text: string
) {
  const admin = createAdminClient();

  await setStatus(materialId, "chunking", { extracted_text: text });
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error("Text produced no chunks");

  await setStatus(materialId, "embedding");
  const vectors = await embedDocuments(chunks.map((c) => c.content));
  const rows = chunks.map((chunk, i) => ({
    material_id: materialId,
    course_id: courseId,
    user_id: userId,
    content: chunk.content,
    // pgvector expects the literal "[1,2,3]" text format, not a JS array.
    embedding: JSON.stringify(vectors[i]),
    chunk_index: chunk.index,
    metadata: {},
  }));

  for (let i = 0; i < rows.length; i += 50) {
    const batch = rows.slice(i, i + 50);
    const { error } = await admin.from("chunks").insert(batch);
    if (error) throw error;
  }

  await setStatus(materialId, "done", { chunk_count: rows.length });
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
    let text =
      fileType === "notes"
        ? extractPlainText(buffer)
        : await extractPdfText(buffer);

    // Scanned PDFs have no embedded text layer, so pdf-parse returns little or
    // nothing. Fall back to Gemini vision OCR to read the page images.
    if (fileType !== "notes" && (!text || text.length < 20)) {
      await setStatus(materialId, "extracting", { error: null });
      text = await ocrPdf(buffer);
    }

    if (!text || text.length < 10) {
      throw new Error(
        "No readable text could be extracted from this file, even with OCR."
      );
    }

    // 2–4. Chunk → embed → store
    await embedAndStore(materialId, courseId, userId, text);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    console.error(`[pipeline] material ${materialId} failed:`, err);
    await setStatus(materialId, "error", { error: message });
  }
}

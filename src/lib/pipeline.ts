import { createAdminClient } from "@/lib/supabase/admin";
import { extractPdfText, extractPlainText } from "@/lib/pdf";
import { chunkText } from "@/lib/ai/chunking";
import { embedDocuments } from "@/lib/ai/embeddings";
import { ocrPdf } from "@/lib/ai/gemini";
import type { FileType, MaterialStatus } from "@/lib/types";

const BUCKET = "materials";

/**
 * A job that never wrote a progress heartbeat is dead (server died before
 * work started). Jobs that are updating "Page 40 of 380" are left alone —
 * a textbook can take a long time on purpose.
 */
const STUCK_NO_HEARTBEAT_MS = 5 * 60 * 1000;

const STUCK_MESSAGE =
  "Processing stopped unexpectedly (the app was probably closed). Keep Clarify running and click Retry.";

function isHeartbeat(message: string | null | undefined): boolean {
  return Boolean(message && /^(Downloading|Page |Extracted |Chunking |Embedding )/i.test(message));
}

async function setStatus(
  materialId: string,
  status: MaterialStatus,
  extra: Record<string, unknown> = {}
) {
  const admin = createAdminClient();
  await admin.from("materials").update({ status, ...extra }).eq("id", materialId);
}

/** Live status line shown in the UI while status is still processing. */
async function setProgress(materialId: string, status: MaterialStatus, progress: string) {
  await setStatus(materialId, status, { error: progress });
}

async function materialStillExists(materialId: string): Promise<boolean> {
  const admin = createAdminClient();
  const { data } = await admin
    .from("materials")
    .select("id")
    .eq("id", materialId)
    .maybeSingle();
  return Boolean(data);
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
  if (!(await materialStillExists(materialId))) return;

  const admin = createAdminClient();

  await setProgress(materialId, "chunking", "Chunking extracted text…");
  const chunks = chunkText(text);
  if (chunks.length === 0) throw new Error("Text produced no chunks");

  await setProgress(
    materialId,
    "embedding",
    `Embedding 0 of ${chunks.length} chunks…`
  );
  const vectors = await embedDocuments(
    chunks.map((c) => c.content),
    (done, total) => {
      void setProgress(
        materialId,
        "embedding",
        `Embedding ${done} of ${total} chunks…`
      );
    }
  );

  if (!(await materialStillExists(materialId))) return;

  const rows = chunks.map((chunk, i) => ({
    material_id: materialId,
    course_id: courseId,
    user_id: userId,
    content: chunk.content,
    embedding: JSON.stringify(vectors[i]),
    chunk_index: chunk.index,
    metadata: {},
  }));

  for (let i = 0; i < rows.length; i += 50) {
    if (!(await materialStillExists(materialId))) return;
    await setProgress(
      materialId,
      "embedding",
      `Saving chunks ${Math.min(i + 50, rows.length)} of ${rows.length}…`
    );
    const batch = rows.slice(i, i + 50);
    const { error } = await admin.from("chunks").insert(batch);
    if (error) throw error;
  }

  await setStatus(materialId, "done", { chunk_count: rows.length, error: null });
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
  const started = Date.now();

  try {
    if (!(await materialStillExists(materialId))) return;

    await setProgress(materialId, "extracting", "Downloading file…");
    const { data: file, error: dlErr } = await admin.storage
      .from(BUCKET)
      .download(storagePath);
    if (dlErr || !file) throw new Error("Could not download uploaded file");

    const buffer = Buffer.from(await file.arrayBuffer());
    console.log(
      `[pipeline] ${materialId} downloaded ${buffer.length} bytes in ${Date.now() - started}ms`
    );

    let text: string;
    if (fileType === "notes") {
      await setProgress(materialId, "extracting", "Reading notes…");
      text = extractPlainText(buffer);
    } else {
      await setProgress(materialId, "extracting", "Opening PDF…");
      let lastWrite = 0;
      text = await extractPdfText(buffer, (page, total) => {
        const now = Date.now();
        if (page !== total && page > 0 && now - lastWrite < 400) return;
        lastWrite = now;
        const label = total
          ? `Page ${page} of ${total}`
          : `Page ${page}`;
        void setProgress(materialId, "extracting", `${label}…`);
      });
    }

    console.log(
      `[pipeline] ${materialId} extracted ${text.length} chars in ${Date.now() - started}ms`
    );

    if (fileType !== "notes" && (!text || text.length < 20)) {
      await setProgress(
        materialId,
        "extracting",
        "No text layer — running OCR…"
      );
      text = await ocrPdf(buffer);
    }

    if (!text || text.length < 10) {
      throw new Error(
        "No readable text could be extracted from this file, even with OCR."
      );
    }

    await embedAndStore(materialId, courseId, userId, text);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Processing failed";
    console.error(`[pipeline] material ${materialId} failed:`, err);
    if (await materialStillExists(materialId)) {
      await setStatus(materialId, "error", { error: message });
    }
  }
}

/**
 * Only mark a row dead if it never started (no heartbeat) and has been sitting
 * for minutes. A textbook mid-extract with "Page 200 of 380" is left running.
 */
export async function markStuckMaterials(
  rows: { id: string; status: string; uploaded_at: string; error?: string | null }[]
): Promise<Set<string>> {
  const now = Date.now();
  const stuckIds = new Set<string>();
  const admin = createAdminClient();

  for (const row of rows) {
    if (!["pending", "extracting", "chunking", "embedding"].includes(row.status)) {
      continue;
    }
    if (isHeartbeat(row.error)) continue;
    const age = now - new Date(row.uploaded_at).getTime();
    if (Number.isNaN(age) || age < STUCK_NO_HEARTBEAT_MS) continue;
    stuckIds.add(row.id);
    await admin
      .from("materials")
      .update({ status: "error", error: STUCK_MESSAGE })
      .eq("id", row.id)
      .in("status", ["pending", "extracting", "chunking", "embedding"]);
  }

  return stuckIds;
}

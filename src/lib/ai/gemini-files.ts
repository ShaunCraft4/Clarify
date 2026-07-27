/**
 * Minimal client for the Gemini Files API (2GB per file, free, 48h retention).
 *
 * The bundled SDK's `GoogleAIFileManager.uploadFile()` only accepts a path on
 * disk — it calls `fs.readFileSync` internally — which would mean spooling
 * every large upload to a temp file first. We talk to the resumable upload
 * endpoint directly so a Buffer can go straight through.
 */

const UPLOAD_URL =
  "https://generativelanguage.googleapis.com/upload/v1beta/files";
const FILES_URL = "https://generativelanguage.googleapis.com/v1beta";

function apiKey(): string {
  const key = process.env.GOOGLE_AI_API_KEY;
  if (!key) throw new Error("GOOGLE_AI_API_KEY is not set");
  return key;
}

export interface GeminiFile {
  /** Resource name, e.g. "files/abc123". */
  name: string;
  uri: string;
  mimeType: string;
}

/** Upload bytes to the Files API and return the handle to reference in prompts. */
export async function uploadToGeminiFiles(
  buffer: Buffer,
  mimeType: string,
  displayName: string
): Promise<GeminiFile> {
  const key = apiKey();

  const start = await fetch(`${UPLOAD_URL}?key=${key}`, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(buffer.length),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: displayName } }),
  });
  if (!start.ok) {
    throw new Error(
      `Couldn't start the audio upload to Gemini (${start.status}).`
    );
  }

  const uploadUrl = start.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    throw new Error("Gemini didn't return an upload URL for the audio.");
  }

  // A view over the existing bytes — avoids copying a multi-hundred-MB buffer
  // just to satisfy fetch's BodyInit type.
  const body = new Uint8Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength
  ) as unknown as BodyInit;

  const finalize = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "Content-Length": String(buffer.length),
      "X-Goog-Upload-Offset": "0",
      "X-Goog-Upload-Command": "upload, finalize",
    },
    body,
  });
  if (!finalize.ok) {
    throw new Error(`Uploading the audio to Gemini failed (${finalize.status}).`);
  }

  const payload = (await finalize.json()) as {
    file?: { name?: string; uri?: string; mimeType?: string };
  };
  const file = payload.file;
  if (!file?.name || !file?.uri) {
    throw new Error("Gemini didn't return a usable file after upload.");
  }

  return { name: file.name, uri: file.uri, mimeType: file.mimeType ?? mimeType };
}

/**
 * Uploaded media is processed asynchronously and can't be used until it
 * reports ACTIVE. Long recordings take a while, hence the generous timeout.
 */
export async function waitForGeminiFile(
  name: string,
  timeoutMs = 240_000
): Promise<void> {
  const key = apiKey();
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(`${FILES_URL}/${name}?key=${key}`);
    if (!res.ok) {
      throw new Error(`Couldn't check the audio upload status (${res.status}).`);
    }

    const file = (await res.json()) as { state?: string };
    if (file.state === "ACTIVE") return;
    if (file.state === "FAILED") {
      throw new Error("Gemini couldn't process that audio file.");
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));
  }

  throw new Error(
    "Gemini took too long to process that recording. Try a shorter one."
  );
}

/** Best-effort cleanup — uploads also auto-expire after 48 hours. */
export async function deleteGeminiFile(name: string): Promise<void> {
  try {
    await fetch(`${FILES_URL}/${name}?key=${apiKey()}`, { method: "DELETE" });
  } catch {
    /* ignore */
  }
}

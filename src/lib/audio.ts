/**
 * Shared audio helpers for the "notes from audio" feature.
 * Kept free of server-only imports so both the browser UI and API route can
 * use the same limits and MIME resolution.
 */

/**
 * Upload cap for a single recording. Long lectures are the point of this
 * feature — a 3-hour class easily runs past 100MB — so we allow up to 200MB
 * and send anything sizeable through Gemini's Files API (2GB per file).
 */
export const MAX_AUDIO_BYTES = 200 * 1024 * 1024;

/**
 * Below this we send audio inline in the request, which is a single round trip
 * and keeps short voice notes snappy. Base64 inflates by ~33%, so this stays
 * well inside Gemini's 100MB inline payload limit. Anything larger goes through
 * the Files API instead.
 */
export const INLINE_AUDIO_MAX_BYTES = 12 * 1024 * 1024;

/** Past this we warn that the upload itself will take a while. */
export const LARGE_AUDIO_HINT_BYTES = 50 * 1024 * 1024;

/**
 * Transcript fallback for recordings too big (or too awkward) to upload. A
 * 3-hour lecture transcribes to roughly 200k characters, so this leaves plenty
 * of headroom while staying comfortably inside the model's context window.
 */
export const MAX_TRANSCRIPT_CHARS = 500_000;

/** Anything shorter than this is a stray paste, not a transcript. */
export const MIN_TRANSCRIPT_CHARS = 200;

/** `accept` attribute for the upload input. */
export const AUDIO_ACCEPT_ATTR =
  "audio/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac,.aiff,.webm";

/** Extension → MIME type Gemini understands. */
const EXTENSION_MIME: Record<string, string> = {
  mp3: "audio/mp3",
  mpga: "audio/mp3",
  wav: "audio/wav",
  wave: "audio/wav",
  m4a: "audio/mp4",
  mp4: "audio/mp4",
  aac: "audio/aac",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  opus: "audio/ogg",
  flac: "audio/flac",
  aif: "audio/aiff",
  aiff: "audio/aiff",
  webm: "audio/webm",
};

/** Browser-reported MIME → the canonical type Gemini expects. */
const REPORTED_MIME: Record<string, string> = {
  "audio/mpeg": "audio/mp3",
  "audio/mp3": "audio/mp3",
  "audio/wav": "audio/wav",
  "audio/wave": "audio/wav",
  "audio/x-wav": "audio/wav",
  "audio/vnd.wave": "audio/wav",
  "audio/mp4": "audio/mp4",
  "audio/m4a": "audio/mp4",
  "audio/x-m4a": "audio/mp4",
  "audio/aac": "audio/aac",
  "audio/ogg": "audio/ogg",
  "audio/opus": "audio/ogg",
  "audio/flac": "audio/flac",
  "audio/x-flac": "audio/flac",
  "audio/aiff": "audio/aiff",
  "audio/x-aiff": "audio/aiff",
  "audio/webm": "audio/webm",
};

/**
 * Resolve a usable audio MIME type from what the browser reported plus the
 * filename. Browsers are inconsistent (and sometimes report nothing at all),
 * so the extension acts as the fallback. Returns null if unsupported.
 */
export function resolveAudioMimeType(
  reportedType: string | undefined | null,
  filename: string
): string | null {
  // MediaRecorder reports e.g. "audio/webm;codecs=opus" — drop the parameters.
  const base = (reportedType ?? "").split(";")[0].trim().toLowerCase();
  if (REPORTED_MIME[base]) return REPORTED_MIME[base];

  const ext = filename.toLowerCase().split(".").pop() ?? "";
  return EXTENSION_MIME[ext] ?? null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

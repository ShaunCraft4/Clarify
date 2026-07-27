"use client";

import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiFetch } from "@/lib/fetcher";
import { recordStudyActivity } from "@/lib/study-streak";
import TopicBuilder, {
  type TopicItem,
  emptyTopic,
} from "@/components/TopicBuilder";
import ActivityProgress, { ACTIVITY_ESTIMATES } from "@/components/ActivityProgress";
import AudioRecorder from "@/components/AudioRecorder";
import {
  AUDIO_ACCEPT_ATTR,
  LARGE_AUDIO_HINT_BYTES,
  MAX_AUDIO_BYTES,
  MAX_TRANSCRIPT_CHARS,
  MIN_TRANSCRIPT_CHARS,
  formatBytes,
  resolveAudioMimeType,
} from "@/lib/audio";
import {
  NotebookPen,
  Loader2,
  Download,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  FileDown,
  FileText,
  Sparkles,
  AudioLines,
  Upload,
  X,
} from "lucide-react";

interface NotesResult {
  title: string;
  notes: string;
}

export default function NotesTab({ courseId }: { courseId: string }) {
  const [topics, setTopics] = useState<TopicItem[]>([emptyTopic()]);
  const [useMaterials, setUseMaterials] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NotesResult | null>(null);
  const [copied, setCopied] = useState(false);
  const articleRef = useRef<HTMLElement>(null);

  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showTranscript, setShowTranscript] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [transcriptLoading, setTranscriptLoading] = useState(false);

  const busy = loading || audioLoading || transcriptLoading;
  const transcriptChars = transcript.trim().length;

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    const clean = topics
      .map((t) => ({ ...t, title: t.title.trim() }))
      .filter((t) => t.title);
    if (clean.length === 0) {
      setError("Add at least one thing you want explained.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<NotesResult>(`/api/courses/${courseId}/notes`, {
        method: "POST",
        body: JSON.stringify({ topics: clean, useMaterials }),
      });
      setResult(res);
      recordStudyActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate notes");
    } finally {
      setLoading(false);
    }
  }

  function pickAudioFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    // Allow re-picking the same file after a failed attempt.
    e.target.value = "";
    if (!file) return;

    if (!resolveAudioMimeType(file.type, file.name)) {
      setAudioError(
        "That file type isn't supported. Use MP3, WAV, M4A, AAC, OGG, FLAC, or WEBM audio."
      );
      setAudioFile(null);
      return;
    }
    if (file.size > MAX_AUDIO_BYTES) {
      setAudioError(
        `That file is ${formatBytes(file.size)} — the limit is ${formatBytes(
          MAX_AUDIO_BYTES
        )}. Compress it to MP3, split it up, or paste its transcript below instead.`
      );
      setAudioFile(null);
      setShowTranscript(true);
      return;
    }

    setAudioError(null);
    setAudioFile(file);
  }

  async function generateFromAudio(audio: Blob, filename: string) {
    setAudioLoading(true);
    setAudioError(null);
    setError(null);
    setResult(null);
    try {
      const form = new FormData();
      form.append("audio", audio, filename);
      const res = await apiFetch<NotesResult>(
        `/api/courses/${courseId}/notes/audio`,
        { method: "POST", body: form }
      );
      setResult(res);
      recordStudyActivity();
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Could not generate notes from that audio";
      // Hosted platforms (Vercel and friends) cap request bodies well below our
      // own limit, so a big upload fails at the edge before reaching the route.
      const tooLarge = message.includes("413");
      setAudioError(
        tooLarge
          ? "This recording is too large for the hosted demo, which caps uploads at about 4.5 MB. Upload a shorter clip, paste its transcript below, or run Clarify locally for full-length lectures."
          : message
      );
      if (tooLarge) setShowTranscript(true);
    } finally {
      setAudioLoading(false);
    }
  }

  async function generateFromTranscript() {
    const text = transcript.trim();
    if (text.length < MIN_TRANSCRIPT_CHARS) {
      setAudioError(
        `That transcript is too short to work with — paste at least ${MIN_TRANSCRIPT_CHARS} characters.`
      );
      return;
    }
    setTranscriptLoading(true);
    setAudioError(null);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<NotesResult>(
        `/api/courses/${courseId}/notes/transcript`,
        { method: "POST", body: JSON.stringify({ transcript: text }) }
      );
      setResult(res);
      recordStudyActivity();
    } catch (err) {
      setAudioError(
        err instanceof Error
          ? err.message
          : "Could not generate notes from that transcript"
      );
    } finally {
      setTranscriptLoading(false);
    }
  }

  function copyNotes() {
    if (!result) return;
    navigator.clipboard.writeText(result.notes).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  function downloadMarkdown() {
    if (!result) return;
    const blob = new Blob([result.notes], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(result.title)}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadPdf() {
    if (!result || !articleRef.current) return;
    const win = window.open("", "_blank", "width=820,height=1000");
    if (!win) return;
    win.document.write(printHtml(result.title, articleRef.current.innerHTML));
    win.document.close();
    win.focus();
    // Let styles/layout settle before invoking the print dialog.
    setTimeout(() => win.print(), 350);
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
          <NotebookPen className="h-5 w-5 text-brand-600" />
          Note generation
        </h2>
        <p className="text-sm text-slate-500 mt-1">
          List everything you need explained — add subtopics to go deeper — and
          Clarify writes you a polished, downloadable set of notes.
        </p>
      </div>

      <form onSubmit={generate} className="space-y-4">
        <TopicBuilder topics={topics} onChange={setTopics} />

        <label className="flex items-start gap-2 text-sm text-slate-600 select-none cursor-pointer">
          <input
            type="checkbox"
            checked={useMaterials}
            onChange={(e) => setUseMaterials(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span>
            Only use my uploaded course materials{" "}
            <span className="text-slate-400">
              (notes come from your library, not general AI knowledge)
            </span>
          </span>
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <ActivityProgress
          active={loading}
          label="Generating your notes…"
          estimateSeconds={ACTIVITY_ESTIMATES.notes}
          hint="Explaining your topics in detail — this can take up to a minute if the AI queue is busy."
        />

        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-lg bg-brand-600 px-5 py-2.5 font-medium text-white shadow-sm transition hover:bg-brand-700 hover:shadow disabled:opacity-60 active:scale-[0.98]"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Writing your notes…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Generate notes
            </>
          )}
        </button>
      </form>

      <section className="space-y-3 border-t border-slate-200 pt-6">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-800">
            <AudioLines className="h-5 w-5 text-brand-600" />
            Notes from audio
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Upload a lecture recording or record one here — Clarify listens and
            turns the speech into structured notes. Handles full-length classes
            up to {formatBytes(MAX_AUDIO_BYTES)}; large files take a while to
            upload.
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept={AUDIO_ACCEPT_ATTR}
          onChange={pickAudioFile}
          className="hidden"
        />

        {audioFile ? (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 animate-fade-in">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-700">
              <AudioLines className="h-3.5 w-3.5" />
            </span>
            <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
              {audioFile.name}{" "}
              <span className="text-slate-400">
                ({formatBytes(audioFile.size)})
              </span>
            </span>
            <button
              type="button"
              onClick={() => generateFromAudio(audioFile, audioFile.name)}
              disabled={busy}
              className="btn-primary px-3 py-1.5 text-sm"
            >
              <Sparkles className="h-4 w-4" />
              Generate notes
            </button>
            <button
              type="button"
              onClick={() => setAudioFile(null)}
              disabled={busy}
              title="Remove file"
              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-60"
            >
              <X className="h-4 w-4" />
            </button>
            {audioFile.size > LARGE_AUDIO_HINT_BYTES && (
              <p className="w-full text-xs text-slate-400">
                Large file — uploading may take several minutes on a slow
                connection. Keep this tab open.
              </p>
            )}
          </div>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-brand-400 hover:text-brand-700 disabled:opacity-60"
          >
            <Upload className="h-4 w-4" />
            Upload an audio file
          </button>
        )}

        <AudioRecorder onSend={generateFromAudio} busy={busy} />

        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowTranscript((open) => !open)}
            className="flex items-center gap-1 text-sm font-medium text-slate-500 transition hover:text-brand-700"
          >
            {showTranscript ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            Too big to upload? Paste a transcript instead
          </button>

          {showTranscript && (
            <div className="space-y-2 animate-fade-in">
              <p className="text-sm text-slate-500">
                If your recording is over {formatBytes(MAX_AUDIO_BYTES)} — or you
                already have a transcript from Zoom, Teams, or your phone — paste
                the text here and Clarify will write the notes from that.
              </p>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                rows={7}
                placeholder="Paste the lecture transcript here…"
                className="w-full resize-y rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm leading-relaxed text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-brand-400 focus:ring-2 focus:ring-brand-100"
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span
                  className={`text-xs ${
                    transcriptChars > MAX_TRANSCRIPT_CHARS
                      ? "text-red-600"
                      : "text-slate-400"
                  }`}
                >
                  {transcriptChars.toLocaleString()} /{" "}
                  {MAX_TRANSCRIPT_CHARS.toLocaleString()} characters
                </span>
                <div className="flex items-center gap-2">
                  {transcript && (
                    <button
                      type="button"
                      onClick={() => setTranscript("")}
                      disabled={busy}
                      className="rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-60"
                    >
                      Clear
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={generateFromTranscript}
                    disabled={
                      busy ||
                      transcriptChars < MIN_TRANSCRIPT_CHARS ||
                      transcriptChars > MAX_TRANSCRIPT_CHARS
                    }
                    className="btn-primary px-3 py-1.5 text-sm"
                  >
                    <FileText className="h-4 w-4" />
                    Generate from transcript
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {audioError && <p className="text-sm text-red-600">{audioError}</p>}

        <ActivityProgress
          active={audioLoading || transcriptLoading}
          label={
            transcriptLoading
              ? "Reading your transcript…"
              : "Listening to your recording…"
          }
          estimateSeconds={
            transcriptLoading
              ? ACTIVITY_ESTIMATES.notes
              : ACTIVITY_ESTIMATES.audioNotes
          }
          hint={
            transcriptLoading
              ? "Organising the transcript into structured notes — long transcripts take a little longer."
              : "Transcribing the audio and writing structured notes — longer recordings take more time."
          }
        />
      </section>

      {result && (
        <div className="space-y-3 animate-fade-in">
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              onClick={copyNotes}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              {copied ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Copied" : "Copy"}
            </button>
            <button
              onClick={downloadMarkdown}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
            >
              <FileDown className="h-4 w-4" />
              .md
            </button>
            <button
              onClick={downloadPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700"
            >
              <Download className="h-4 w-4" />
              Download PDF
            </button>
          </div>

          <article
            ref={articleRef}
            className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm prose-notes"
          >
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {result.notes}
            </ReactMarkdown>
          </article>
        </div>
      )}
    </div>
  );
}

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "clarify-notes"
  );
}

/** Standalone, nicely-styled HTML document for printing / saving as PDF. */
function printHtml(title: string, body: string) {
  return `<!doctype html>
<html><head><meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    color: #1e293b; line-height: 1.65; max-width: 720px; margin: 40px auto; padding: 0 28px;
  }
  h1 { font-size: 26px; font-weight: 800; color: #0f172a; margin: 0 0 4px; }
  h2 { font-size: 18px; font-weight: 700; color: #0f172a; margin: 26px 0 8px; padding-bottom: 4px; border-bottom: 1px solid #e2e8f0; }
  h3 { font-size: 15px; font-weight: 700; color: #1e293b; margin: 18px 0 6px; }
  p { margin: 8px 0; }
  ul, ol { margin: 8px 0; padding-left: 22px; }
  li { margin: 3px 0; }
  strong { color: #0f172a; }
  code { background: #f1f5f9; border-radius: 4px; padding: 1px 5px; font-size: 0.9em; }
  blockquote { margin: 12px 0; padding: 10px 14px; background: #fff7ed; border: 1px solid #fed7aa; border-radius: 8px; color: #9a3412; }
  blockquote p { margin: 0; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; font-size: 0.95em; }
  th, td { border: 1px solid #e2e8f0; padding: 6px 10px; text-align: left; }
  th { background: #f8fafc; }
  a { color: #1d54f5; }
  @media print { body { margin: 0 auto; } }
</style></head>
<body>${body}</body></html>`;
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

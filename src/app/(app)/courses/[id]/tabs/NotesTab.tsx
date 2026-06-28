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
import {
  NotebookPen,
  Loader2,
  Download,
  Copy,
  Check,
  FileDown,
  Sparkles,
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
          disabled={loading}
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

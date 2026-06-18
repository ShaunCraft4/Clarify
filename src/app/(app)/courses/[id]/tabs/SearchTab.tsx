"use client";

import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiFetch } from "@/lib/fetcher";
import { Search, Loader2, FileText, BookOpen, ChevronDown } from "lucide-react";

interface Source {
  materialId: string;
  materialName: string;
  excerpt: string;
}

interface SearchResult {
  notes: string;
  sources: Source[];
  empty?: boolean;
}

export default function SearchTab({ courseId }: { courseId: string }) {
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<SearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showSources, setShowSources] = useState(false);

  async function run(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await apiFetch<SearchResult>(
        `/api/courses/${courseId}/search`,
        { method: "POST", body: JSON.stringify({ query }) }
      );
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="p-8 max-w-3xl mx-auto">
      <form onSubmit={run} className="flex gap-2 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='e.g. "Summarize everything about the Industrial Revolution"'
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        </div>
        <button
          type="submit"
          disabled={loading || !query.trim()}
          className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Writing notes…
            </>
          ) : (
            "Make notes"
          )}
        </button>
      </form>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {!result && !loading && !error && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <BookOpen className="h-10 w-10 mx-auto text-slate-300" />
          <p className="mt-3 text-slate-500">
            Search a topic and Clarify will pull together clean study notes from
            your materials.
          </p>
        </div>
      )}

      {result?.empty && (
        <p className="text-slate-500 text-center mt-10">
          Nothing in this course&apos;s materials matched that topic.
        </p>
      )}

      {result && !result.empty && (
        <div className="space-y-4">
          <article className="rounded-2xl border border-slate-200 bg-white p-6 prose-notes">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {result.notes}
            </ReactMarkdown>
          </article>

          {result.sources.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white">
              <button
                onClick={() => setShowSources((s) => !s)}
                className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-600"
              >
                <span>Sources ({result.sources.length})</span>
                <ChevronDown
                  className={`h-4 w-4 transition-transform ${
                    showSources ? "rotate-180" : ""
                  }`}
                />
              </button>
              {showSources && (
                <div className="px-4 pb-4 space-y-2">
                  {result.sources.map((s) => (
                    <div
                      key={s.materialId}
                      className="rounded-lg bg-slate-50 border border-slate-200 p-3"
                    >
                      <p className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                        <FileText className="h-4 w-4 text-brand-600" />
                        {s.materialName}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">
                        {s.excerpt}…
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

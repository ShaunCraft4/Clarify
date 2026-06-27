"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import { invalidateCourseCache } from "@/lib/course-cache";
import { useCourseFlashcards } from "@/hooks/useCourseFlashcards";
import ActivityProgress, { ACTIVITY_ESTIMATES } from "@/components/ActivityProgress";
import type { Flashcard } from "@/lib/types";
import {
  flashcardsToAnkiCsv,
  flashcardsToMarkdown,
  downloadTextFile,
} from "@/lib/flashcard-export";
import {
  FLASHCARD_IMPORT_GUIDE,
  detectImportFormat,
} from "@/lib/flashcard-import";
import { recordStudyActivity } from "@/lib/study-streak";
import { cn } from "@/lib/cn";
import {
  Sparkles,
  Loader2,
  Play,
  Check,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  Trash2,
  X,
  Download,
  FileText,
  Clock,
  Upload,
  ChevronDown,
  Info,
} from "lucide-react";

function isDue(dueAt: string | null | undefined): boolean {
  if (!dueAt) return true;
  return new Date(dueAt) <= new Date();
}

export default function FlashcardsTab({ courseId }: { courseId: string }) {
  const {
    flashcards: cards,
    dueCount,
    isLoading,
    refresh,
    patch,
  } = useCourseFlashcards(courseId);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [showImportGuide, setShowImportGuide] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const reviewCards = useMemo(() => {
    const due = cards.filter((c) => isDue(c.due_at));
    if (due.length > 0) return due;
    return cards;
  }, [cards]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      await apiFetch(`/api/courses/${courseId}/flashcards/generate`, {
        method: "POST",
        body: JSON.stringify({ count: 12 }),
      });
      invalidateCourseCache(courseId, "flashcards");
      await refresh();
      recordStudyActivity();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function importFile(file: File) {
    setImporting(true);
    setError(null);
    try {
      const content = await file.text();
      const format = detectImportFormat(content);
      if (!format) {
        setError(
          "Unrecognized format. Use Clarify Markdown or Anki CSV — see the import guide."
        );
        return;
      }
      await apiFetch(`/api/courses/${courseId}/flashcards/import`, {
        method: "POST",
        body: JSON.stringify({ content, format }),
      });
      invalidateCourseCache(courseId, "flashcards");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setImporting(false);
    }
  }

  async function remove(id: string) {
    patch((prev) => ({
      ...prev,
      flashcards: prev.flashcards.filter((c) => c.id !== id),
    }));
    await apiFetch(`/api/flashcards/${id}`, { method: "DELETE" }).catch(
      () => {}
    );
    invalidateCourseCache(courseId, "flashcards");
    await refresh();
  }

  const masteredCount = cards.filter((c) => c.mastered_at).length;

  if (isLoading && cards.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (reviewing && reviewCards.length > 0) {
    return (
      <ReviewMode
        courseId={courseId}
        cards={reviewCards}
        onExit={() => {
          setReviewing(false);
          void refresh();
        }}
        onUpdate={(updated) =>
          patch((prev) => ({
            ...prev,
            flashcards: prev.flashcards.map((c) =>
              c.id === updated.id ? updated : c
            ),
          }))
        }
      />
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h2 className="text-lg font-semibold">Flashcards</h2>
          <p className="text-sm text-slate-500">
            {cards.length} cards · {masteredCount} mastered ·{" "}
            <span className={dueCount > 0 ? "text-amber-600 font-medium" : ""}>
              {dueCount} due today
            </span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={importing}
            className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            Import deck
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,.md,.markdown,.txt"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importFile(file);
              e.target.value = "";
            }}
          />
          {cards.length > 0 && (
            <>
              <button
                onClick={() =>
                  downloadTextFile(
                    flashcardsToMarkdown(cards),
                    "flashcards.md",
                    "text/markdown;charset=utf-8"
                  )
                }
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <Download className="h-4 w-4" />
                Markdown
              </button>
              <button
                onClick={() =>
                  downloadTextFile(
                    flashcardsToAnkiCsv(cards),
                    "flashcards-anki.csv"
                  )
                }
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
              >
                <Download className="h-4 w-4" />
                Anki CSV
              </button>
              <button
                onClick={() => setReviewing(true)}
                className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100"
              >
                <Play className="h-4 w-4" />
                Review {dueCount > 0 ? `(${dueCount} due)` : "all"}
              </button>
            </>
          )}
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {generating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            Generate flashcards
          </button>
        </div>
      </div>

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      <div className="mb-4 rounded-xl border border-slate-200 bg-white">
        <button
          type="button"
          onClick={() => setShowImportGuide((s) => !s)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium text-slate-600"
        >
          <span className="flex items-center gap-1.5">
            <Info className="h-4 w-4 text-brand-600" />
            Import format guide
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 transition-transform",
              showImportGuide && "rotate-180"
            )}
          />
        </button>
        {showImportGuide && (
          <div className="px-4 pb-4 text-xs text-slate-600 whitespace-pre-wrap leading-relaxed border-t border-slate-100 pt-3">
            {FLASHCARD_IMPORT_GUIDE}
          </div>
        )}
      </div>

      <ActivityProgress
        active={generating}
        label="Generating flashcards…"
        estimateSeconds={ACTIVITY_ESTIMATES.flashcards}
        hint="Reading your materials and creating Q&A pairs."
      />

      {cards.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <Sparkles className="h-10 w-10 mx-auto text-slate-300" />
          <p className="mt-3 text-slate-500">
            No flashcards yet. Generate a set from your materials.
          </p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {cards.map((c) => (
            <div
              key={c.id}
              className="group relative rounded-xl border border-slate-200 bg-white p-4"
            >
              <button
                onClick={() => remove(c.id)}
                className="absolute top-2 right-2 p-1.5 rounded-md text-slate-300 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              {c.topic && (
                <span className="inline-block text-xs font-medium text-brand-700 bg-brand-50 rounded-full px-2 py-0.5 mb-2">
                  {c.topic}
                </span>
              )}
              <p className="font-medium text-slate-800">{c.question}</p>
              <p className="text-sm text-slate-500 mt-2">{c.answer}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                {c.mastered_at && (
                  <span className="inline-flex items-center gap-1 text-emerald-600">
                    <Check className="h-3 w-3" /> Mastered
                  </span>
                )}
                {isDue(c.due_at) && !c.mastered_at && (
                  <span className="inline-flex items-center gap-1 text-amber-600">
                    <Clock className="h-3 w-3" /> Due
                  </span>
                )}
                {c.source_material && (
                  <span className="inline-flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    {c.source_material}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewMode({
  courseId,
  cards,
  onExit,
  onUpdate,
}: {
  courseId: string;
  cards: Flashcard[];
  onExit: () => void;
  onUpdate: (c: Flashcard) => void;
}) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [showSource, setShowSource] = useState(false);
  const [slideClass, setSlideClass] = useState("card-slide-in-right");
  const card = cards[i];

  const goTo = useCallback(
    (nextIndex: number, direction: "left" | "right") => {
      setFlipped(false);
      setShowSource(false);
      setSlideClass(
        direction === "right" ? "card-slide-in-right" : "card-slide-in-left"
      );
      setI(nextIndex);
    },
    []
  );

  const next = useCallback(() => {
    goTo(Math.min(i + 1, cards.length - 1), "right");
  }, [cards.length, goTo, i]);

  const prev = useCallback(() => {
    goTo(Math.max(i - 1, 0), "left");
  }, [goTo, i]);

  const rate = useCallback(
    async (rating: "again" | "good" | "easy") => {
      const { flashcard } = await apiFetch<{ flashcard: Flashcard }>(
        `/api/flashcards/${card.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ rating, reviewed: true }),
        }
      );
      onUpdate(flashcard);
      recordStudyActivity();
      invalidateCourseCache(courseId, "flashcards", "progress");
      if (i >= cards.length - 1) onExit();
      else goTo(i + 1, "right");
    },
    [card.id, cards.length, courseId, goTo, i, onExit, onUpdate]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.code === "Space") {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (e.code === "ArrowRight") next();
      else if (e.code === "ArrowLeft") prev();
      else if (e.key === "Escape") onExit();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [next, prev, onExit]);

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={onExit}
          className="flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"
        >
          <X className="h-4 w-4" /> Exit review
        </button>
        <span className="text-sm text-slate-500">
          {i + 1} / {cards.length} · spaced repetition
        </span>
      </div>

      <div className="h-2 bg-slate-200 rounded-full mb-6">
        <div
          className="h-2 bg-brand-600 rounded-full transition-all"
          style={{ width: `${((i + 1) / cards.length) * 100}%` }}
        />
      </div>

      <div
        key={card.id}
        className={cn("flip-card h-72 cursor-pointer", slideClass)}
        onClick={() => setFlipped((f) => !f)}
      >
        <div
          className={cn(
            "flip-inner relative h-full w-full",
            flipped && "flipped"
          )}
        >
          <div className="flip-face absolute inset-0 rounded-2xl border border-slate-200 bg-white p-8 flex flex-col items-center justify-center text-center">
            {card.topic && (
              <span className="text-xs font-medium text-brand-700 bg-brand-50 rounded-full px-2 py-0.5 mb-3">
                {card.topic}
              </span>
            )}
            <p className="text-xl font-semibold text-slate-800">
              {card.question}
            </p>
            <p className="text-xs text-slate-400 mt-4">
              Click or press Space to flip
            </p>
          </div>
          <div className="flip-face flip-back absolute inset-0 rounded-2xl border border-brand-200 bg-brand-50 p-8 flex items-center justify-center text-center">
            <p className="text-lg text-slate-800">{card.answer}</p>
          </div>
        </div>
      </div>

      {card.source_material && (
        <button
          onClick={() => setShowSource((s) => !s)}
          className="mt-3 text-xs text-brand-600 hover:underline flex items-center gap-1"
        >
          <FileText className="h-3 w-3" />
          {showSource ? "Hide" : "Show"} source · {card.source_material}
        </button>
      )}
      {showSource && card.source_excerpt && (
        <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          {card.source_excerpt}…
        </div>
      )}

      <div className="flex items-center justify-between mt-6 gap-2">
        <button
          onClick={prev}
          disabled={i === 0}
          className="p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex flex-wrap justify-center gap-2">
          <button
            onClick={() => rate("again")}
            className="flex items-center gap-1.5 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            <RotateCcw className="h-4 w-4" />
            Again
          </button>
          <button
            onClick={() => rate("good")}
            className="flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
          >
            <Check className="h-4 w-4" />
            Good
          </button>
          <button
            onClick={() => rate("easy")}
            className="flex items-center gap-1.5 rounded-lg border border-brand-300 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
          >
            Easy
          </button>
        </div>

        <button
          onClick={next}
          disabled={i === cards.length - 1}
          className="p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      </div>
    </div>
  );
}

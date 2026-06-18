"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import type { Flashcard } from "@/lib/types";
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
} from "lucide-react";

export default function FlashcardsTab({ courseId }: { courseId: string }) {
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);

  const load = useCallback(async () => {
    const { flashcards } = await apiFetch<{ flashcards: Flashcard[] }>(
      `/api/courses/${courseId}/flashcards`
    );
    setCards(flashcards);
    setLoading(false);
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      await apiFetch(`/api/courses/${courseId}/flashcards/generate`, {
        method: "POST",
        body: JSON.stringify({ count: 12 }),
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function remove(id: string) {
    setCards((c) => c.filter((x) => x.id !== id));
    await apiFetch(`/api/flashcards/${id}`, { method: "DELETE" }).catch(() => {});
  }

  const masteredCount = cards.filter((c) => c.mastered_at).length;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (reviewing && cards.length > 0) {
    return (
      <ReviewMode
        cards={cards}
        onExit={() => setReviewing(false)}
        onUpdate={(updated) =>
          setCards((cs) => cs.map((c) => (c.id === updated.id ? updated : c)))
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
            {cards.length} cards · {masteredCount} mastered
          </p>
        </div>
        <div className="flex gap-2">
          {cards.length > 0 && (
            <button
              onClick={() => setReviewing(true)}
              className="flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-100"
            >
              <Play className="h-4 w-4" />
              Review
            </button>
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
              {c.mastered_at && (
                <span className="mt-2 inline-flex items-center gap-1 text-xs text-emerald-600">
                  <Check className="h-3 w-3" /> Mastered
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ReviewMode({
  cards,
  onExit,
  onUpdate,
}: {
  cards: Flashcard[];
  onExit: () => void;
  onUpdate: (c: Flashcard) => void;
}) {
  const [i, setI] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = cards[i];

  const next = useCallback(() => {
    setFlipped(false);
    setI((x) => Math.min(x + 1, cards.length - 1));
  }, [cards.length]);

  const prev = useCallback(() => {
    setFlipped(false);
    setI((x) => Math.max(x - 1, 0));
  }, []);

  const mark = useCallback(
    async (mastered: boolean) => {
      const { flashcard } = await apiFetch<{ flashcard: Flashcard }>(
        `/api/flashcards/${card.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({ mastered, reviewed: true }),
        }
      );
      onUpdate(flashcard);
      next();
    },
    [card, next, onUpdate]
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
          {i + 1} / {cards.length}
        </span>
      </div>

      <div className="h-2 bg-slate-200 rounded-full mb-6">
        <div
          className="h-2 bg-brand-600 rounded-full transition-all"
          style={{ width: `${((i + 1) / cards.length) * 100}%` }}
        />
      </div>

      <div
        className="flip-card h-72 cursor-pointer"
        onClick={() => setFlipped((f) => !f)}
      >
        <div className={cn("flip-inner relative h-full w-full", flipped && "flipped")}>
          <div className="flip-face absolute inset-0 rounded-2xl border border-slate-200 bg-white p-8 flex flex-col items-center justify-center text-center">
            {card.topic && (
              <span className="text-xs font-medium text-brand-700 bg-brand-50 rounded-full px-2 py-0.5 mb-3">
                {card.topic}
              </span>
            )}
            <p className="text-xl font-semibold text-slate-800">
              {card.question}
            </p>
            <p className="text-xs text-slate-400 mt-4">Click or press Space to flip</p>
          </div>
          <div className="flip-face flip-back absolute inset-0 rounded-2xl border border-brand-200 bg-brand-50 p-8 flex items-center justify-center text-center">
            <p className="text-lg text-slate-800">{card.answer}</p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mt-6">
        <button
          onClick={prev}
          disabled={i === 0}
          className="p-2 rounded-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          <ChevronLeft className="h-5 w-5" />
        </button>

        <div className="flex gap-2">
          <button
            onClick={() => mark(false)}
            className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 font-medium text-amber-700 hover:bg-amber-100"
          >
            <RotateCcw className="h-4 w-4" />
            Needs review
          </button>
          <button
            onClick={() => mark(true)}
            className="flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2 font-medium text-emerald-700 hover:bg-emerald-100"
          >
            <Check className="h-4 w-4" />
            Mastered
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

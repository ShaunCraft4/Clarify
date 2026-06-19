"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/cn";

export interface TopicItem {
  title: string;
  subtopics: string[];
}

export function emptyTopic(): TopicItem {
  return { title: "", subtopics: [] };
}

/**
 * Controlled editor for a list of topics, each with optional focus subtopics.
 * Shared by the Materials "add topics" flow and the Notes generator.
 */
export default function TopicBuilder({
  topics,
  onChange,
}: {
  topics: TopicItem[];
  onChange: (topics: TopicItem[]) => void;
}) {
  const update = (i: number, patch: Partial<TopicItem>) =>
    onChange(topics.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));

  const remove = (i: number) =>
    onChange(topics.filter((_, idx) => idx !== i));

  const add = () => onChange([...topics, emptyTopic()]);

  return (
    <div className="space-y-3">
      {topics.map((t, i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-200 bg-white p-3 space-y-2.5 animate-fade-in"
        >
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
              {i + 1}
            </span>
            <input
              value={t.title}
              onChange={(e) => update(i, { title: e.target.value })}
              placeholder="Topic (e.g. The Industrial Revolution)"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
            {topics.length > 1 && (
              <button
                type="button"
                onClick={() => remove(i)}
                className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                title="Remove topic"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <SubtopicInput
            subtopics={t.subtopics}
            onChange={(subtopics) => update(i, { subtopics })}
          />
        </div>
      ))}

      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 hover:border-brand-400 hover:text-brand-700"
      >
        <Plus className="h-4 w-4" />
        Add another topic
      </button>
    </div>
  );
}

function SubtopicInput({
  subtopics,
  onChange,
}: {
  subtopics: string[];
  onChange: (subtopics: string[]) => void;
}) {
  const [draft, setDraft] = useState("");

  const commit = () => {
    const value = draft.trim().replace(/,$/, "").trim();
    if (value && !subtopics.includes(value)) onChange([...subtopics, value]);
    setDraft("");
  };

  return (
    <div className="pl-8">
      <div
        className={cn(
          "flex flex-wrap items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5",
          "focus-within:border-brand-400 focus-within:ring-2 focus-within:ring-brand-100"
        )}
      >
        {subtopics.map((s) => (
          <span
            key={s}
            className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-medium text-brand-700"
          >
            {s}
            <button
              type="button"
              onClick={() => onChange(subtopics.filter((x) => x !== s))}
              className="hover:text-brand-900"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              commit();
            } else if (e.key === "Backspace" && !draft && subtopics.length) {
              onChange(subtopics.slice(0, -1));
            }
          }}
          onBlur={commit}
          placeholder={
            subtopics.length ? "Add subtopic…" : "Optional subtopics to focus on…"
          }
          className="min-w-[10rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      </div>
    </div>
  );
}

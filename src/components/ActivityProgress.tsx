"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

/** Typical wait times so students know what to expect. */
export const ACTIVITY_ESTIMATES = {
  search: 30,
  notes: 55,
  ask: 20,
  flashcards: 25,
  quiz: 35,
  studyPlan: 25,
  insights: 25,
  upload: 45,
} as const;

function useElapsed(active: boolean) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!active) {
      setElapsed(0);
      return;
    }
    const start = Date.now();
    setElapsed(0);
    const t = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000
    );
    return () => clearInterval(t);
  }, [active]);

  return elapsed;
}

export default function ActivityProgress({
  active,
  label,
  estimateSeconds,
  hint,
}: {
  active: boolean;
  label: string;
  estimateSeconds: number;
  hint?: string;
}) {
  const elapsed = useElapsed(active);
  if (!active) return null;

  const remaining = Math.max(0, estimateSeconds - elapsed);
  const pct = Math.min(95, Math.round((elapsed / estimateSeconds) * 100));
  const timeLabel =
    remaining > 0
      ? `About ${remaining}s remaining`
      : "Taking a bit longer than usual — almost there…";

  return (
    <div
      role="status"
      aria-live="polite"
      className="rounded-xl border border-brand-200 bg-brand-50/80 p-4 animate-fade-in"
    >
      <div className="flex items-center gap-2 text-sm font-medium text-brand-800">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        {label}
      </div>
      {hint && <p className="mt-1 text-xs text-brand-700/80">{hint}</p>}
      <p className="mt-2 text-xs text-slate-600">
        {timeLabel}
        <span className="text-slate-400"> · {elapsed}s elapsed</span>
      </p>
      <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-brand-100">
        <div
          className="h-full rounded-full bg-brand-500 transition-all duration-1000 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

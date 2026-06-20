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
      className="activity-progress rounded-xl border p-4 animate-fade-in"
    >
      <div className="activity-progress__label flex items-center gap-2 text-sm font-medium">
        <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
        {label}
      </div>
      {hint && (
        <p className="activity-progress__hint mt-1 text-xs">{hint}</p>
      )}
      <p className="activity-progress__time mt-2 text-xs font-semibold">
        {timeLabel}
        <span> · {elapsed}s elapsed</span>
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

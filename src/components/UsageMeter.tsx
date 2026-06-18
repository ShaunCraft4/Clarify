"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import { Zap, Clock } from "lucide-react";
import { cn } from "@/lib/cn";

interface UsageWindow {
  limit: number;
  used: number;
  remaining: number;
  resetInMs: number;
}
interface Usage {
  minute: UsageWindow;
  day: UsageWindow;
}

export default function UsageMeter() {
  const [usage, setUsage] = useState<Usage | null>(null);
  // Local clock so the reset countdown ticks smoothly between fetches.
  const fetchedAt = useRef<number>(Date.now());
  const [, force] = useState(0);

  async function load() {
    try {
      const u = await apiFetch<Usage>("/api/usage");
      setUsage(u);
      fetchedAt.current = Date.now();
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    load();
    const poll = setInterval(load, 5000);
    const refetchOnFocus = () => load();
    window.addEventListener("focus", refetchOnFocus);
    // Re-render every second for the countdown.
    const tick = setInterval(() => force((n) => n + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("focus", refetchOnFocus);
    };
  }, []);

  if (!usage) return null;

  const elapsed = Date.now() - fetchedAt.current;
  const minuteRemaining = usage.minute.remaining;
  const resetIn = Math.max(0, Math.ceil((usage.minute.resetInMs - elapsed) / 1000));
  const dayRemaining = usage.day.remaining;

  const depleted = minuteRemaining <= 0;
  const low = minuteRemaining <= 2;

  return (
    <div
      title={`Approximate free-tier budget.\n${usage.minute.used}/${usage.minute.limit} used this minute · ${dayRemaining}/${usage.day.limit} left today`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
        depleted
          ? "border-red-200 bg-red-50 text-red-700"
          : low
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-white text-slate-600"
      )}
    >
      {depleted ? (
        <>
          <Clock className="h-3.5 w-3.5" />
          AI limit reached · resets in {resetIn}s
        </>
      ) : (
        <>
          <Zap className="h-3.5 w-3.5 text-brand-500" />
          {minuteRemaining} AI request{minuteRemaining === 1 ? "" : "s"} left
          this minute
          <span className="text-slate-400">· {dayRemaining} today</span>
        </>
      )}
    </div>
  );
}

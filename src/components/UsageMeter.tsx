"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import { Zap, Clock, Loader2 } from "lucide-react";
import { cn } from "@/lib/cn";

interface UsageWindow {
  limit: number;
  used: number;
  remaining: number;
  resetInMs: number;
  blockedUntilMs?: number;
}
interface Usage {
  minute: UsageWindow;
  day: UsageWindow;
  embedMinute?: UsageWindow;
  queue?: { llm: number; embed: number };
}

export default function UsageMeter() {
  const [usage, setUsage] = useState<Usage | null>(null);
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
    const poll = setInterval(load, 4000);
    const refetchOnFocus = () => load();
    window.addEventListener("focus", refetchOnFocus);
    const tick = setInterval(() => force((n) => n + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(tick);
      window.removeEventListener("focus", refetchOnFocus);
    };
  }, []);

  if (!usage) return null;

  const elapsed = Date.now() - fetchedAt.current;
  const googleBlocked = (usage.minute.blockedUntilMs ?? 0) > elapsed;
  const embedBlocked = (usage.embedMinute?.blockedUntilMs ?? 0) > elapsed;
  const blockedReset = Math.max(
    0,
    Math.ceil(
      (Math.max(
        usage.minute.blockedUntilMs ?? 0,
        usage.embedMinute?.blockedUntilMs ?? 0
      ) -
        elapsed) /
        1000
    )
  );
  const minuteRemaining = googleBlocked ? 0 : usage.minute.remaining;
  const resetIn = Math.max(
    0,
    Math.ceil((usage.minute.resetInMs - elapsed) / 1000)
  );
  const dayRemaining = usage.day.remaining;
  const dayLow = dayRemaining <= 20;
  const queued = (usage.queue?.llm ?? 0) + (usage.queue?.embed ?? 0);

  const depleted = minuteRemaining <= 0 && !embedBlocked;
  const low = minuteRemaining <= 2 && !googleBlocked && !embedBlocked;

  return (
    <div
      title={`Free-tier budget.\nText: ${usage.minute.used}/${usage.minute.limit}/min · ${usage.day.remaining}/${usage.day.limit} left today\nEmbeddings: ${usage.embedMinute?.used ?? 0}/${usage.embedMinute?.limit ?? "?"} this minute${queued ? `\n${queued} queued` : ""}`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium",
        googleBlocked || embedBlocked || depleted
          ? "border-red-200 bg-red-50 text-red-700"
          : low || dayLow
            ? "border-amber-200 bg-amber-50 text-amber-700"
            : "border-slate-200 bg-white text-slate-600"
      )}
    >
      {googleBlocked || embedBlocked ? (
        <>
          <Clock className="h-3.5 w-3.5" />
          {embedBlocked && !googleBlocked
            ? `Upload limit · retry in ${blockedReset}s`
            : `Google limit · retry in ${blockedReset}s`}
        </>
      ) : depleted ? (
        <>
          <Clock className="h-3.5 w-3.5" />
          AI limit reached · resets in {resetIn}s
        </>
      ) : queued > 0 ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          {minuteRemaining} left · {queued} queued
        </>
      ) : (
        <>
          <Zap className="h-3.5 w-3.5 text-brand-500" />
          {minuteRemaining} AI request{minuteRemaining === 1 ? "" : "s"} left
          this minute
          <span className="text-slate-400">
            · {dayRemaining} today{dayLow ? " (low)" : ""}
          </span>
        </>
      )}
    </div>
  );
}

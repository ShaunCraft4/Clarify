/**
 * In-process tracker for Gemini generation calls so the UI can show how many
 * requests remain before the free-tier rate limit kicks in.
 *
 * Google doesn't return remaining free-tier quota in a reliable header, so we
 * count our own calls against the known budget. Limits are approximate and
 * overridable via env (GEMINI_RPM / GEMINI_RPD). Counters are per-process and
 * reset on server restart — fine for a single-user dev/demo setup.
 */
const MINUTE = 60_000;
const DAY = 86_400_000;

const RPM = Number(process.env.GEMINI_RPM) || 10;
const RPD = Number(process.env.GEMINI_RPD) || 250;

const minuteHits: number[] = [];
const dayHits: number[] = [];

function prune() {
  const now = Date.now();
  while (minuteHits.length && now - minuteHits[0] > MINUTE) minuteHits.shift();
  while (dayHits.length && now - dayHits[0] > DAY) dayHits.shift();
}

/** Record one Gemini generation request (call this per attempt). */
export function recordLlmCall() {
  const now = Date.now();
  minuteHits.push(now);
  dayHits.push(now);
  prune();
}

export interface UsageWindow {
  limit: number;
  used: number;
  remaining: number;
  resetInMs: number;
}

export function getUsage(): { minute: UsageWindow; day: UsageWindow } {
  prune();
  const now = Date.now();
  return {
    minute: {
      limit: RPM,
      used: minuteHits.length,
      remaining: Math.max(0, RPM - minuteHits.length),
      resetInMs: minuteHits.length ? MINUTE - (now - minuteHits[0]) : 0,
    },
    day: {
      limit: RPD,
      used: dayHits.length,
      remaining: Math.max(0, RPD - dayHits.length),
      resetInMs: dayHits.length ? DAY - (now - dayHits[0]) : 0,
    },
  };
}

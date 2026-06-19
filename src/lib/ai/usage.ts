/**

 * In-process tracker for Gemini API usage so the UI can show a realistic

 * remaining budget. Google doesn't expose free-tier quota in headers, so we

 * combine: our own call counts, queue depth, and any 429 the API returns.

 *

 * LLM and embedding quotas are tracked separately — a 429 on embeddings during

 * upload should not block search/ask LLM calls.

 */

import { getQueueDepth } from "./queue";



const MINUTE = 60_000;

const DAY = 86_400_000;



/** gemini-2.5-flash free tier ≈ 5 RPM / 250 RPD on AI Studio (see your Rate limits page). */

const LLM_RPM = Number(process.env.GEMINI_RPM) || 5;

const LLM_RPD = Number(process.env.GEMINI_RPD) || 250;

/** gemini-embedding-001 free tier is much higher but still finite. */

const EMBED_RPM = Number(process.env.GEMINI_EMBED_RPM) || 100;



const llmMinuteHits: number[] = [];

const embedMinuteHits: number[] = [];

const dayHits: number[] = [];



let llmBlockedUntil = 0;

let embedBlockedUntil = 0;



function prune() {

  const now = Date.now();

  while (llmMinuteHits.length && now - llmMinuteHits[0] > MINUTE)

    llmMinuteHits.shift();

  while (embedMinuteHits.length && now - embedMinuteHits[0] > MINUTE)

    embedMinuteHits.shift();

  while (dayHits.length && now - dayHits[0] > DAY) dayHits.shift();

}



export function recordLlmCall() {

  const now = Date.now();

  llmMinuteHits.push(now);

  dayHits.push(now);

  prune();

}



export function recordEmbedCall(count = 1) {

  const now = Date.now();

  for (let i = 0; i < count; i++) embedMinuteHits.push(now);

  prune();

}



export function recordLlmRateLimit(retryAfterMs?: number) {

  const block = Math.max(retryAfterMs ?? 60_000, 5_000);

  llmBlockedUntil = Math.max(llmBlockedUntil, Date.now() + block);

}



export function recordEmbedRateLimit(retryAfterMs?: number) {

  const block = Math.max(retryAfterMs ?? 60_000, 5_000);

  embedBlockedUntil = Math.max(embedBlockedUntil, Date.now() + block);

}



/** @deprecated Use recordLlmRateLimit or recordEmbedRateLimit */

export function recordExternalRateLimit(retryAfterMs?: number) {

  recordLlmRateLimit(retryAfterMs);

  recordEmbedRateLimit(retryAfterMs);

}



export function assertCanCallLlm(): void {

  prune();

  if (llmBlockedUntil > Date.now()) {

    const secs = Math.ceil((llmBlockedUntil - Date.now()) / 1000);

    throw new Error(

      `Gemini text limit active. Wait about ${secs} seconds, then try again.`

    );

  }

}



export function assertCanCallEmbed(): void {

  prune();

  if (embedBlockedUntil > Date.now()) {

    const secs = Math.ceil((embedBlockedUntil - Date.now()) / 1000);

    throw new Error(

      `Gemini embedding limit active (often from uploading materials). Wait about ${secs} seconds, then try again.`

    );

  }

}



export function isLlmBlocked(): boolean {

  prune();

  return llmBlockedUntil > Date.now();

}



export interface UsageWindow {

  limit: number;

  used: number;

  remaining: number;

  resetInMs: number;

  blockedUntilMs: number;

}



export interface UsageSnapshot {

  minute: UsageWindow;

  day: UsageWindow;

  embedMinute: UsageWindow;

  queue: { llm: number; embed: number };

}



export function getUsage(): UsageSnapshot {

  prune();

  const now = Date.now();

  const llmGoogleBlocked = llmBlockedUntil > now;

  const embedGoogleBlocked = embedBlockedUntil > now;

  const llmUsed = llmMinuteHits.length;

  const embedUsed = embedMinuteHits.length;

  const llmRemaining = llmGoogleBlocked

    ? 0

    : Math.max(0, LLM_RPM - llmUsed);

  const embedRemaining = embedGoogleBlocked

    ? 0

    : Math.max(0, EMBED_RPM - embedUsed);

  const oldestLlm = llmMinuteHits[0] ?? null;

  const oldestEmbed = embedMinuteHits[0] ?? null;



  return {

    minute: {

      limit: LLM_RPM,

      used: llmUsed,

      remaining: llmRemaining,

      resetInMs: llmGoogleBlocked

        ? llmBlockedUntil - now

        : oldestLlm

          ? MINUTE - (now - oldestLlm)

          : 0,

      blockedUntilMs: llmGoogleBlocked ? llmBlockedUntil - now : 0,

    },

    day: {

      limit: LLM_RPD,

      used: dayHits.length,

      remaining: Math.max(0, LLM_RPD - dayHits.length),

      resetInMs: dayHits.length ? DAY - (now - dayHits[0]) : 0,

      blockedUntilMs: 0,

    },

    embedMinute: {

      limit: EMBED_RPM,

      used: embedUsed,

      remaining: embedRemaining,

      resetInMs: embedGoogleBlocked

        ? embedBlockedUntil - now

        : oldestEmbed

          ? MINUTE - (now - oldestEmbed)

          : 0,

      blockedUntilMs: embedGoogleBlocked ? embedBlockedUntil - now : 0,

    },

    queue: getQueueDepth(),

  };

}



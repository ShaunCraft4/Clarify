/**
 * In-process rate limiter. Spaces out API calls to stay under Gemini free-tier
 * limits. Waits *before* each call (not after) so idle periods don't add delay.
 */
class RateLimitedQueue {
  private chain: Promise<unknown> = Promise.resolve();
  private lastStart = 0;
  private queued = 0;

  constructor(private readonly minSpacingMs: number) {}

  /** How many tasks are waiting to run (including the one about to start). */
  get depth(): number {
    return this.queued;
  }

  run<T>(task: () => Promise<T>): Promise<T> {
    this.queued++;
    const result = this.chain.then(async () => {
      const elapsed = Date.now() - this.lastStart;
      const wait = Math.max(0, this.minSpacingMs - elapsed);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      this.lastStart = Date.now();
      this.queued--;
      return task();
    });
    this.chain = result.catch(() => undefined);
    return result;
  }
}

/** ~12s spacing => ≤5 LLM calls/min (matches AI Studio free-tier RPM). */
export const llmQueue = new RateLimitedQueue(
  Number(process.env.GEMINI_QUEUE_MS) || 12_000
);
/** Embeddings have their own quota but still need gentle spacing. */
export const embedQueue = new RateLimitedQueue(
  Number(process.env.GEMINI_EMBED_QUEUE_MS) || 350
);

export function getQueueDepth() {
  return { llm: llmQueue.depth, embed: embedQueue.depth };
}

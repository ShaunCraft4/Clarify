/**
 * Minimal in-process rate limiter. Gemini 2.0 Flash free tier allows ~15
 * requests/minute; embeddings are higher. We serialise calls with a small
 * spacing delay so batch embedding during uploads doesn't trip the limit.
 */
class RateLimitedQueue {
  private chain: Promise<unknown> = Promise.resolve();

  constructor(private readonly minSpacingMs: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.chain.then(async () => {
      const value = await task();
      await new Promise((r) => setTimeout(r, this.minSpacingMs));
      return value;
    });
    // Keep the chain alive even if a task rejects.
    this.chain = result.catch(() => undefined);
    return result;
  }
}

// ~6.5s spacing => <10 req/min for generation (gemini-2.5-flash free tier).
export const llmQueue = new RateLimitedQueue(6500);
// Embeddings allow more throughput.
export const embedQueue = new RateLimitedQueue(120);

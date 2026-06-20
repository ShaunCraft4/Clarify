export type ReviewRating = "again" | "good" | "easy";

export interface SrsState {
  ease_factor: number;
  interval_days: number;
  due_at: string;
  review_count: number;
  mastered_at: string | null;
}

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + Math.max(1, days));
  return d.toISOString();
}

/** Simplified SM-2 scheduling after a review. */
export function scheduleReview(
  rating: ReviewRating,
  easeFactor: number,
  intervalDays: number,
  reviewCount: number
): Pick<SrsState, "ease_factor" | "interval_days" | "due_at" | "mastered_at"> {
  let ease = easeFactor;
  let interval = intervalDays;
  const q = rating === "again" ? 1 : rating === "good" ? 4 : 5;

  if (q < 3) {
    return {
      ease_factor: Math.max(1.3, ease - 0.15),
      interval_days: 1,
      due_at: addDays(1),
      mastered_at: null,
    };
  }

  ease = ease + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  ease = Math.max(1.3, Math.round(ease * 100) / 100);

  if (reviewCount <= 1) interval = 1;
  else if (reviewCount === 2) interval = 3;
  else if (rating === "easy") interval = Math.round(interval * ease * 1.25);
  else interval = Math.round(interval * ease);

  interval = Math.max(1, interval);
  const mastered_at = interval >= 21 ? new Date().toISOString() : null;

  return {
    ease_factor: ease,
    interval_days: interval,
    due_at: addDays(interval),
    mastered_at,
  };
}

export function isDue(dueAt: string | null | undefined): boolean {
  if (!dueAt) return true;
  return new Date(dueAt) <= new Date();
}

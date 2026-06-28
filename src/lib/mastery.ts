import type { SupabaseClient } from "@supabase/supabase-js";
import type { TopicBreakdown } from "@/lib/types";

/**
 * Update running topic-mastery scores from a quiz attempt's per-topic results.
 * Mastery is a running average of per-attempt topic accuracy in [0,1].
 */
export async function updateTopicMastery(
  supabase: SupabaseClient,
  userId: string,
  courseId: string,
  breakdown: TopicBreakdown[]
) {
  for (const b of breakdown) {
    if (b.total === 0) continue;
    const accuracy = b.correct / b.total;

    const { data: existing } = await supabase
      .from("topic_mastery")
      .select("id, mastery_score, attempts_count")
      .eq("course_id", courseId)
      .eq("topic", b.topic)
      .maybeSingle();

    if (existing) {
      const n = existing.attempts_count + 1;
      const score = (existing.mastery_score * existing.attempts_count + accuracy) / n;
      await supabase
        .from("topic_mastery")
        .update({
          mastery_score: score,
          attempts_count: n,
          last_updated_at: new Date().toISOString(),
        })
        .eq("id", existing.id);
    } else {
      await supabase.from("topic_mastery").insert({
        user_id: userId,
        course_id: courseId,
        topic: b.topic,
        mastery_score: accuracy,
        attempts_count: 1,
      });
    }
  }
}

/** Normalise an answer for lenient comparison (short-answer grading). */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

/** Levenshtein edit distance between two strings. */
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Similarity ratio in [0,1] based on edit distance. */
export function answerSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  const dist = editDistance(a, b);
  return 1 - dist / Math.max(a.length, b.length);
}

/**
 * Map an LLM "correctAnswer" to the exact option string shown to the student.
 * Handles letter keys (A/B/C), minor wording drift, and casing.
 */
export function alignCorrectAnswerToOptions(
  correctAnswer: string,
  options: string[]
): string {
  const answer = correctAnswer.trim();
  if (!answer || options.length === 0) return answer;

  const normAnswer = normalize(answer);
  const exact = options.find((o) => normalize(o) === normAnswer);
  if (exact) return exact;

  const letterPrefix = normAnswer.match(/^([a-d])[).:\s]/);
  if (letterPrefix) {
    const idx = letterPrefix[1].charCodeAt(0) - "a".charCodeAt(0);
    if (idx >= 0 && idx < options.length) return options[idx];
  }
  if (/^[a-d]$/.test(normAnswer)) {
    const idx = normAnswer.charCodeAt(0) - "a".charCodeAt(0);
    if (idx >= 0 && idx < options.length) return options[idx];
  }

  const partial = options.find(
    (o) =>
      normalize(o).includes(normAnswer) || normAnswer.includes(normalize(o))
  );
  if (partial) return partial;

  let best = options[0];
  let bestScore = 0;
  for (const o of options) {
    const score = answerSimilarity(normalize(o), normAnswer);
    if (score > bestScore) {
      bestScore = score;
      best = o;
    }
  }
  return bestScore >= 0.75 ? best : answer;
}

export function isCorrect(
  type: string,
  userAnswer: string,
  correctAnswer: string,
  options?: string[] | null
): boolean {
  let reference = correctAnswer;
  if (
    (type === "multiple_choice" || type === "true_false") &&
    options?.length
  ) {
    reference = alignCorrectAnswerToOptions(correctAnswer, options);
  }

  const a = normalize(userAnswer);
  const b = normalize(reference);

  if (type === "short_answer") {
    if (!a) return false;
    // Exact, containment, or close enough to forgive typos / minor word-form
    // differences (e.g. "proletarian" vs "proletariat").
    if (a === b) return true;
    if (b.length > 3 && (a.includes(b) || b.includes(a))) return true;
    // Compare best-matching word too, so a correct keyword inside a longer
    // answer still counts.
    const wordMatch = a
      .split(" ")
      .some((w) => b.split(" ").some((bw) => answerSimilarity(w, bw) >= 0.8));
    return answerSimilarity(a, b) >= 0.8 || wordMatch;
  }

  // Multiple choice / true-false: forgive only trivial typos.
  if (a === b) return true;
  return answerSimilarity(a, b) >= 0.9;
}

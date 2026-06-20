import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJSON } from "@/lib/ai/gemini";
import { gatherCourseContent } from "@/lib/content";
import { isMissingColumn } from "@/lib/db-schema";
import type { QuestionType } from "@/lib/types";

export interface GeneratedQuestion {
  question: string;
  type: QuestionType;
  options?: string[];
  correctAnswer: string;
  topic: string;
}

interface GenerateQuizParams {
  supabase: SupabaseClient;
  courseId: string;
  userId: string;
  courseName: string;
  counts: {
    multiple_choice: number;
    true_false: number;
    short_answer: number;
  };
  rubricText?: string | null;
  focusTopics?: string[];
  isExamSim?: boolean;
  timeLimitMinutes?: number;
}

const VALID_TYPES = new Set<QuestionType>([
  "multiple_choice",
  "true_false",
  "short_answer",
]);

function normalizeType(raw: unknown, hasOptions: boolean): QuestionType {
  const t = String(raw ?? "")
    .toLowerCase()
    .replace(/-/g, "_")
    .replace(/\s+/g, "_");
  if (VALID_TYPES.has(t as QuestionType)) return t as QuestionType;
  if (t.includes("true") || t.includes("false")) return "true_false";
  if (hasOptions) return "multiple_choice";
  return "short_answer";
}

/** Normalize LLM output — field names vary between responses. */
export function normalizeGeneratedQuestion(
  raw: unknown
): GeneratedQuestion | null {
  if (!raw || typeof raw !== "object") return null;
  const q = raw as Record<string, unknown>;
  const question = String(q.question ?? q.prompt ?? q.text ?? "").trim();
  const correctAnswer = String(
    q.correctAnswer ?? q.correct_answer ?? q.answer ?? q.correct ?? ""
  ).trim();
  if (!question || !correctAnswer) return null;

  const optionsRaw = q.options ?? q.choices;
  const options = Array.isArray(optionsRaw)
    ? optionsRaw.map(String).filter(Boolean)
    : undefined;

  const type = normalizeType(q.type, Boolean(options?.length));
  const topic = String(q.topic ?? q.subject ?? "General").trim() || "General";

  return { question, type, options, correctAnswer, topic };
}

function buildPromptParts(
  counts: GenerateQuizParams["counts"],
  content: string,
  extras: { examBlock: string; focusBlock: string; rubricBlock: string }
) {
  const typeLines = [
    counts.multiple_choice > 0 &&
      `${counts.multiple_choice} multiple_choice questions (each with "options" array of 4 choices)`,
    counts.true_false > 0 &&
      `${counts.true_false} true_false questions (options ["True","False"])`,
    counts.short_answer > 0 &&
      `${counts.short_answer} short_answer questions (no options; "correctAnswer" as a short phrase)`,
  ]
    .filter(Boolean)
    .join(", and ");

  const total =
    counts.multiple_choice + counts.true_false + counts.short_answer;

  return `Generate EXACTLY ${total} quiz questions: ${typeLines}.
Each object must use these exact keys: "question", "type", "correctAnswer", "topic", and "options" when applicable.
Return a JSON array only.${extras.examBlock}${extras.focusBlock}${extras.rubricBlock}

CONTENT:
${content}`;
}

async function generateBatch(
  prompt: string
): Promise<GeneratedQuestion[]> {
  const raw = await generateJSON<unknown[]>(
    prompt,
    'Return valid JSON only — an array of objects with keys: question, type, correctAnswer, topic, options (if needed). No markdown.'
  );
  return (Array.isArray(raw) ? raw : [])
    .map(normalizeGeneratedQuestion)
    .filter((q): q is GeneratedQuestion => q !== null);
}

export async function generateQuizFromMaterials(
  params: GenerateQuizParams
): Promise<{ quizId: string; count: number }> {
  const {
    supabase,
    courseId,
    userId,
    courseName,
    counts,
    rubricText,
    focusTopics,
    isExamSim,
    timeLimitMinutes,
  } = params;

  const total =
    counts.multiple_choice + counts.true_false + counts.short_answer;

  const content = await gatherCourseContent(supabase, courseId);
  if (!content) {
    throw new Error(
      "No processed material content found. Upload and wait for processing first."
    );
  }

  const rubricBlock = rubricText?.trim()
    ? `\n\nGRADING RUBRIC:\n${rubricText.slice(0, 3500)}`
    : "";
  const focusBlock =
    focusTopics && focusTopics.length > 0
      ? `\n\nPRIORITY TOPICS: ${focusTopics.join(", ")}`
      : "";
  const examBlock = isExamSim
    ? "\n\nEXAM STYLE: challenging distractors, precise terminology."
    : "";

  const extras = { examBlock, focusBlock, rubricBlock };
  let valid: GeneratedQuestion[] = [];

  // Large exams are generated in two batches to avoid truncated JSON.
  if (isExamSim && total > 8) {
    const choiceCounts = {
      multiple_choice: counts.multiple_choice,
      true_false: counts.true_false,
      short_answer: 0,
    };
    const writtenCounts = {
      multiple_choice: 0,
      true_false: 0,
      short_answer: counts.short_answer,
    };
    const batch1 =
      choiceCounts.multiple_choice + choiceCounts.true_false > 0
        ? await generateBatch(buildPromptParts(choiceCounts, content, extras))
        : [];
    const batch2 =
      writtenCounts.short_answer > 0
        ? await generateBatch(buildPromptParts(writtenCounts, content, extras))
        : [];
    valid = [...batch1, ...batch2];
  } else {
    valid = await generateBatch(buildPromptParts(counts, content, extras));
  }

  const minRequired = Math.max(3, Math.ceil(total * 0.5));
  if (valid.length < minRequired) {
    throw new Error(
      `Only ${valid.length} of ${total} questions were generated. Try again in a minute (API rate limit) or use a smaller quiz.`
    );
  }

  const title = isExamSim
    ? `${courseName} Exam Simulation · ${new Date().toLocaleDateString()}`
    : `${courseName} Quiz · ${new Date().toLocaleDateString()}`;

  const baseRow = {
    course_id: courseId,
    user_id: userId,
    title,
  };
  const fullRow = {
    ...baseRow,
    is_exam_sim: Boolean(isExamSim),
    time_limit_minutes: isExamSim ? (timeLimitMinutes ?? 45) : null,
  };

  let { data: quiz, error: quizErr } = await supabase
    .from("quizzes")
    .insert(fullRow)
    .select("*")
    .single();

  if (isMissingColumn(quizErr)) {
    ({ data: quiz, error: quizErr } = await supabase
      .from("quizzes")
      .insert(baseRow)
      .select("*")
      .single());
  }
  if (quizErr) throw quizErr;

  const rows = valid.slice(0, total).map((q, idx) => ({
    quiz_id: quiz.id,
    user_id: userId,
    type: q.type,
    question: q.question,
    options:
      q.type === "true_false"
        ? ["True", "False"]
        : q.options && q.options.length
          ? q.options
          : null,
    correct_answer: q.correctAnswer,
    topic: q.topic || "General",
    position: idx,
  }));

  const { error: qErr } = await supabase.from("quiz_questions").insert(rows);
  if (qErr) throw qErr;

  return { quizId: quiz.id, count: rows.length };
}

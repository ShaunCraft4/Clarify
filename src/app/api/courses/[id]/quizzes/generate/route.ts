import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { generateJSON } from "@/lib/ai/gemini";
import { gatherCourseContent } from "@/lib/content";
import type { QuestionType } from "@/lib/types";

export const maxDuration = 60;

interface GeneratedQuestion {
  question: string;
  type: QuestionType;
  options?: string[];
  correctAnswer: string;
  topic: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user, course } = await requireCourse(id);
    const body = await req.json().catch(() => ({}));
    const materialId: string | undefined = body.materialId;

    const clamp = (v: unknown) =>
      Math.min(Math.max(Math.floor(Number(v) || 0), 0), 20);
    const counts = {
      multiple_choice: clamp(body.counts?.multiple_choice ?? 6),
      true_false: clamp(body.counts?.true_false ?? 2),
      short_answer: clamp(body.counts?.short_answer ?? 2),
    };
    const total =
      counts.multiple_choice + counts.true_false + counts.short_answer;
    if (total < 1) {
      throw new ApiError(400, "Choose at least one question.");
    }
    if (total > 30) {
      throw new ApiError(400, "Please keep the quiz to 30 questions or fewer.");
    }

    const content = await gatherCourseContent(supabase, id, materialId);
    if (!content) {
      throw new ApiError(
        400,
        "No processed material content found. Upload and wait for processing first."
      );
    }

    const typeLines = [
      counts.multiple_choice > 0 &&
        `${counts.multiple_choice} multiple_choice questions (each with an "options" array of 4 plausible choices)`,
      counts.true_false > 0 &&
        `${counts.true_false} true_false questions (options ["True","False"])`,
      counts.short_answer > 0 &&
        `${counts.short_answer} short_answer questions (no options; a concise correctAnswer, ideally a single term or short phrase)`,
    ]
      .filter(Boolean)
      .join(", and ");

    const prompt = `Generate a quiz from the following content with EXACTLY: ${typeLines}. For each question include: "question", "type" (one of multiple_choice|true_false|short_answer), "options" (only where specified above), "correctAnswer" (must exactly match one of the options for choice questions), and "topic" (a specific concept label like "AVL Trees"). Return a JSON array of all ${total} questions.\n\nCONTENT:\n${content}`;

    const questions = await generateJSON<GeneratedQuestion[]>(
      prompt,
      'You must respond with valid JSON only — a JSON array of quiz questions. No markdown, no code fences.'
    );

    const valid = (Array.isArray(questions) ? questions : []).filter(
      (q) => q.question && q.correctAnswer && q.type
    );
    if (valid.length === 0) {
      throw new ApiError(502, "Generation produced no usable questions");
    }

    const title = `${course.name} Quiz · ${new Date().toLocaleDateString()}`;
    const { data: quiz, error: quizErr } = await supabase
      .from("quizzes")
      .insert({ course_id: id, user_id: user.id, title })
      .select("*")
      .single();
    if (quizErr) throw quizErr;

    const rows = valid.map((q, idx) => ({
      quiz_id: quiz.id,
      user_id: user.id,
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

    return NextResponse.json({ quizId: quiz.id, count: rows.length });
  });
}

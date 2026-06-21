import { NextRequest, NextResponse } from "next/server";
import { handle, requireUser, ApiError } from "@/lib/api";
import { isMissingColumn, isExamSimTitle } from "@/lib/db-schema";

/** Fetch a quiz with its questions — WITHOUT the correct answers. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireUser();

    let { data: quiz, error } = await supabase
      .from("quizzes")
      .select("id, course_id, title, created_at, is_exam_sim, time_limit_minutes")
      .eq("id", id)
      .single();

    if (isMissingColumn(error)) {
      ({ data: quiz, error } = await supabase
        .from("quizzes")
        .select("id, course_id, title, created_at")
        .eq("id", id)
        .single());
    }
    if (error || !quiz) throw new ApiError(404, "Quiz not found");

    const { data: questions, error: qErr } = await supabase
      .from("quiz_questions")
      .select("id, quiz_id, type, question, options, topic, position")
      .eq("quiz_id", id)
      .order("position", { ascending: true });
    if (qErr) throw qErr;

    const row = quiz as {
      id: string;
      course_id: string;
      title: string;
      created_at: string;
      is_exam_sim?: boolean;
      time_limit_minutes?: number | null;
    };
    const examSim =
      row.is_exam_sim != null
        ? Boolean(row.is_exam_sim)
        : isExamSimTitle(row.title);

    return NextResponse.json({
      quiz: {
        ...row,
        is_exam_sim: examSim,
        time_limit_minutes:
          row.time_limit_minutes != null
            ? row.time_limit_minutes
            : examSim
              ? 45
              : null,
        questions,
      },
    });
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireUser();
    const { error } = await supabase.from("quizzes").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  });
}

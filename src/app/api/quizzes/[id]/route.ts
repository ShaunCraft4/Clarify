import { NextRequest, NextResponse } from "next/server";
import { handle, requireUser, ApiError } from "@/lib/api";
import { isMissingColumn } from "@/lib/db-schema";

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

    return NextResponse.json({
      quiz: {
        ...quiz,
        is_exam_sim: "is_exam_sim" in quiz ? Boolean(quiz.is_exam_sim) : false,
        time_limit_minutes:
          "time_limit_minutes" in quiz ? quiz.time_limit_minutes : null,
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

import { NextRequest, NextResponse } from "next/server";
import { handle, requireUser, ApiError } from "@/lib/api";

/** Fetch a quiz with its questions — WITHOUT the correct answers. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireUser();

    const { data: quiz, error } = await supabase
      .from("quizzes")
      .select("id, course_id, title, created_at")
      .eq("id", id)
      .single();
    if (error || !quiz) throw new ApiError(404, "Quiz not found");

    const { data: questions, error: qErr } = await supabase
      .from("quiz_questions")
      .select("id, quiz_id, type, question, options, topic, position")
      .eq("quiz_id", id)
      .order("position", { ascending: true });
    if (qErr) throw qErr;

    return NextResponse.json({ quiz: { ...quiz, questions } });
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

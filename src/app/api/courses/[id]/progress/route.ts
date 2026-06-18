import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);

    const [{ data: mastery }, { data: attempts }, { data: flashcards }] =
      await Promise.all([
        supabase
          .from("topic_mastery")
          .select("topic, mastery_score, attempts_count, last_updated_at")
          .eq("course_id", id)
          .order("mastery_score", { ascending: true }),
        supabase
          .from("quiz_attempts")
          .select("score, completed_at")
          .eq("course_id", id)
          .order("completed_at", { ascending: true }),
        supabase
          .from("flashcards")
          .select("mastered_at")
          .eq("course_id", id),
      ]);

    const flashcardsMastered = (flashcards ?? []).filter(
      (f) => f.mastered_at
    ).length;

    return NextResponse.json({
      mastery: mastery ?? [],
      attempts: attempts ?? [],
      stats: {
        quizzesCompleted: (attempts ?? []).length,
        flashcardsTotal: (flashcards ?? []).length,
        flashcardsMastered,
        topicsTracked: (mastery ?? []).length,
      },
    });
  });
}

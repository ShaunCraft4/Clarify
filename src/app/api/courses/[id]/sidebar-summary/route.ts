import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";
import { computeExamReadiness } from "@/lib/exam-readiness";
import { isDue } from "@/lib/srs";
import { isMissingColumn } from "@/lib/db-schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);

    const [readiness, flashcardsRes, attemptsRes] = await Promise.all([
      computeExamReadiness(supabase, id),
      supabase.from("flashcards").select("due_at, created_at").eq("course_id", id),
      supabase
        .from("quiz_attempts")
        .select("score")
        .eq("course_id", id)
        .order("completed_at", { ascending: false })
        .limit(1),
    ]);

    let dueCount = 0;
    if (flashcardsRes.error && isMissingColumn(flashcardsRes.error)) {
      dueCount = 0;
    } else if (flashcardsRes.error) {
      throw flashcardsRes.error;
    } else {
      dueCount = (flashcardsRes.data ?? []).filter((card) =>
        isDue((card.due_at as string | null) ?? (card.created_at as string))
      ).length;
    }

    if (attemptsRes.error) throw attemptsRes.error;

    return NextResponse.json({
      examReadiness: readiness.score,
      dueCount,
      lastQuizScore:
        attemptsRes.data && attemptsRes.data.length > 0
          ? Number(attemptsRes.data[0].score)
          : null,
    });
  });
}

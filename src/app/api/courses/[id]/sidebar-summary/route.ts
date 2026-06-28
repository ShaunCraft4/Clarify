import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";
import { computeExamReadiness } from "@/lib/exam-readiness";
import { isDue } from "@/lib/srs";
import { isMissingColumn } from "@/lib/db-schema";

function countDueFlashcards(
  cards: { due_at?: string | null; created_at?: string | null }[]
): number {
  return cards.filter((card) =>
    isDue((card.due_at as string | null | undefined) ?? card.created_at)
  ).length;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);

    const [readiness, flashcardsRes, attemptsRes] = await Promise.all([
      computeExamReadiness(supabase, id),
      supabase
        .from("flashcards")
        .select("due_at, created_at")
        .eq("course_id", id),
      supabase
        .from("quiz_attempts")
        .select("score")
        .eq("course_id", id)
        .order("completed_at", { ascending: false })
        .limit(1),
    ]);

    let dueCount = 0;
    if (flashcardsRes.error && isMissingColumn(flashcardsRes.error)) {
      const fallback = await supabase
        .from("flashcards")
        .select("created_at")
        .eq("course_id", id);
      if (fallback.error) throw fallback.error;
      dueCount = countDueFlashcards(fallback.data ?? []);
    } else if (flashcardsRes.error) {
      throw flashcardsRes.error;
    } else {
      dueCount = countDueFlashcards(flashcardsRes.data ?? []);
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

import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";
import { isMissingColumn, isExamSimTitle } from "@/lib/db-schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);

    const full = await supabase
      .from("quizzes")
      .select("id, title, created_at, is_exam_sim, time_limit_minutes")
      .eq("course_id", id)
      .order("created_at", { ascending: false });

    const quizzesRes = isMissingColumn(full.error)
      ? await supabase
          .from("quizzes")
          .select("id, title, created_at")
          .eq("course_id", id)
          .order("created_at", { ascending: false })
      : full;

    if (quizzesRes.error) throw quizzesRes.error;
    const quizzes = quizzesRes.data;

    // Attach question counts and best scores.
    const quizIds = (quizzes ?? []).map((q) => q.id);
    const counts: Record<string, number> = {};
    const attempts: Record<string, number> = {};
    if (quizIds.length) {
      const { data: qs } = await supabase
        .from("quiz_questions")
        .select("quiz_id")
        .in("quiz_id", quizIds);
      for (const q of qs ?? []) counts[q.quiz_id] = (counts[q.quiz_id] ?? 0) + 1;

      const { data: at } = await supabase
        .from("quiz_attempts")
        .select("quiz_id, score")
        .in("quiz_id", quizIds);
      for (const a of at ?? [])
        attempts[a.quiz_id] = Math.max(attempts[a.quiz_id] ?? 0, a.score);
    }

    return NextResponse.json({
      quizzes: (quizzes ?? []).map((q) => {
        const examSim =
          "is_exam_sim" in q
            ? Boolean(q.is_exam_sim)
            : isExamSimTitle(q.title);
        return {
          ...q,
          is_exam_sim: examSim,
          time_limit_minutes:
            "time_limit_minutes" in q
              ? q.time_limit_minutes
              : examSim
                ? 45
                : null,
          questionCount: counts[q.id] ?? 0,
          bestScore: attempts[q.id] ?? null,
        };
      }),
    });
  });
}

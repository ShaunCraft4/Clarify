import { NextRequest, NextResponse } from "next/server";
import { handle, requireUser, ApiError } from "@/lib/api";
import { updateTopicMastery, isCorrect } from "@/lib/mastery";
import type { QuizAttemptAnswer, TopicBreakdown } from "@/lib/types";

export const maxDuration = 30;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user } = await requireUser();
    const body = await req.json();
    const submitted: { questionId: string; answer: string }[] = Array.isArray(
      body.answers
    )
      ? body.answers
      : [];

    const { data: quiz, error } = await supabase
      .from("quizzes")
      .select("id, course_id")
      .eq("id", id)
      .single();
    if (error || !quiz) throw new ApiError(404, "Quiz not found");

    // Load questions WITH answers (server-side only) to grade.
    const { data: questions, error: qErr } = await supabase
      .from("quiz_questions")
      .select("id, type, correct_answer, topic")
      .eq("quiz_id", id);
    if (qErr) throw qErr;

    const byId = new Map(
      (questions ?? []).map((q) => [q.id, q] as const)
    );
    const answerById = new Map(submitted.map((a) => [a.questionId, a.answer]));

    const graded: (QuizAttemptAnswer & { correctAnswer: string; topic: string })[] =
      [];
    const topicTally = new Map<string, { correct: number; total: number }>();

    for (const q of questions ?? []) {
      const userAnswer = answerById.get(q.id) ?? "";
      const correct = isCorrect(q.type, userAnswer, q.correct_answer);
      graded.push({
        questionId: q.id,
        answer: userAnswer,
        correct,
        correctAnswer: q.correct_answer,
        topic: q.topic,
      });
      const t = topicTally.get(q.topic) ?? { correct: 0, total: 0 };
      t.total++;
      if (correct) t.correct++;
      topicTally.set(q.topic, t);
    }

    const total = graded.length || 1;
    const correctCount = graded.filter((g) => g.correct).length;
    const score = Math.round((correctCount / total) * 100);

    const topicBreakdown: TopicBreakdown[] = [...topicTally.entries()].map(
      ([topic, v]) => ({ topic, correct: v.correct, total: v.total })
    );

    const { data: attempt, error: insErr } = await supabase
      .from("quiz_attempts")
      .insert({
        quiz_id: id,
        course_id: quiz.course_id,
        user_id: user.id,
        answers: graded.map((g) => ({
          questionId: g.questionId,
          answer: g.answer,
          correct: g.correct,
        })),
        score,
        topic_breakdown: topicBreakdown,
      })
      .select("*")
      .single();
    if (insErr) throw insErr;

    await updateTopicMastery(supabase, user.id, quiz.course_id, topicBreakdown);

    // Return graded detail so the UI can show per-question feedback.
    void byId;
    return NextResponse.json({
      attemptId: attempt.id,
      score,
      correctCount,
      total,
      topicBreakdown,
      results: graded,
    });
  });
}

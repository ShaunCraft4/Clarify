import type { SupabaseClient } from "@supabase/supabase-js";

export interface ExamReadinessBreakdown {
  mastery: number;
  quizTrend: number;
  flashcards: number;
  coverage: number;
}

export interface ExamReadiness {
  score: number;
  breakdown: ExamReadinessBreakdown;
  weakTopics: string[];
  summary: string;
}

export async function computeExamReadiness(
  supabase: SupabaseClient,
  courseId: string
): Promise<ExamReadiness> {
  const [{ data: mastery }, { data: attempts }, { data: flashcards }, { data: materials }] =
    await Promise.all([
      supabase
        .from("topic_mastery")
        .select("topic, mastery_score")
        .eq("course_id", courseId),
      supabase
        .from("quiz_attempts")
        .select("score, completed_at")
        .eq("course_id", courseId)
        .order("completed_at", { ascending: false })
        .limit(5),
      supabase
        .from("flashcards")
        .select("mastered_at")
        .eq("course_id", courseId),
      supabase
        .from("materials")
        .select("id, status")
        .eq("course_id", courseId),
    ]);

  const masteryRows = mastery ?? [];
  const avgMastery =
    masteryRows.length > 0
      ? masteryRows.reduce((s, m) => s + Number(m.mastery_score), 0) /
        masteryRows.length
      : 0;

  const recentScores = (attempts ?? []).map((a) => Number(a.score));
  const quizTrend =
    recentScores.length > 0
      ? recentScores.reduce((s, v) => s + v, 0) / recentScores.length
      : 0;

  const fcTotal = (flashcards ?? []).length;
  const fcMastered = (flashcards ?? []).filter((f) => f.mastered_at).length;
  const flashcardsPct = fcTotal > 0 ? (fcMastered / fcTotal) * 100 : 0;

  const doneMaterials = (materials ?? []).filter((m) => m.status === "done").length;
  const totalMaterials = (materials ?? []).length;
  const coverage =
    totalMaterials > 0
      ? Math.min(100, (doneMaterials / totalMaterials) * 60 + masteryRows.length * 8)
      : 0;

  const breakdown: ExamReadinessBreakdown = {
    mastery: Math.round(avgMastery * 100),
    quizTrend: Math.round(quizTrend),
    flashcards: Math.round(flashcardsPct),
    coverage: Math.round(Math.min(100, coverage)),
  };

  const score = Math.round(
    breakdown.mastery * 0.4 +
      breakdown.quizTrend * 0.3 +
      breakdown.flashcards * 0.15 +
      breakdown.coverage * 0.15
  );

  const weakTopics = masteryRows
    .filter((m) => Number(m.mastery_score) < 0.65)
    .map((m) => m.topic)
    .slice(0, 6);

  let summary: string;
  if (score >= 80) summary = "You're in strong shape — keep reviewing weak spots.";
  else if (score >= 60) summary = "Decent progress — focus on weak topics before the exam.";
  else if (score >= 40) summary = "Still building — take more quizzes and review flashcards.";
  else summary = "Early stage — upload materials, quiz yourself, and review daily.";

  return { score, breakdown, weakTopics, summary };
}

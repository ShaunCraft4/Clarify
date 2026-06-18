import { NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";
import { generateJSON } from "@/lib/ai/gemini";

export const maxDuration = 60;

interface Rec {
  topic: string;
  prerequisites: string[];
}

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);

    const { data: mastery } = await supabase
      .from("topic_mastery")
      .select("topic, mastery_score, attempts_count")
      .eq("course_id", id)
      .order("mastery_score", { ascending: true });

    const { count: attemptCount } = await supabase
      .from("quiz_attempts")
      .select("id", { count: "exact", head: true })
      .eq("course_id", id);

    if (!mastery || mastery.length === 0 || (attemptCount ?? 0) < 2) {
      return NextResponse.json({
        ready: false,
        message:
          "Complete at least 2 quizzes to unlock gap analysis.",
        mastery: mastery ?? [],
      });
    }

    const scores = mastery.map((m) => ({
      topic: m.topic,
      score: Math.round(m.mastery_score * 100),
    }));

    const prompt = `Based on this student's topic scores (0-100): ${JSON.stringify(
      scores
    )}. Identify their top 2-3 weakest areas and, for each, list the prerequisite concepts they should review before improving. Return JSON: [{ "topic": "...", "prerequisites": ["...", "..."] }].`;

    const recs = await generateJSON<Rec[]>(
      prompt,
      'You must respond with valid JSON only — an array of {"topic","prerequisites"}. No markdown.'
    );

    const scoreByTopic = new Map(
      mastery.map((m) => [m.topic, m.mastery_score])
    );
    const recommendations = (Array.isArray(recs) ? recs : []).map((r) => ({
      topic: r.topic,
      prerequisites: r.prerequisites ?? [],
      masteryScore: scoreByTopic.get(r.topic) ?? 0,
    }));

    return NextResponse.json({
      ready: true,
      mastery,
      recommendations,
    });
  });
}

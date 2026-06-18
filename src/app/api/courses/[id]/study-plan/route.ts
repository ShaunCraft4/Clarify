import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { generateJSON } from "@/lib/ai/gemini";
import type { StudyPlanDay } from "@/lib/types";

export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, course } = await requireCourse(id);
    const body = await req.json().catch(() => ({}));

    const examDate: string = (body.examDate ?? "").toString();
    const hoursPerDay: number = Math.min(
      Math.max(Number(body.hoursPerDay) || 2, 0.5),
      12
    );
    if (!examDate) throw new ApiError(400, "examDate is required");

    const exam = new Date(examDate);
    if (isNaN(exam.getTime())) throw new ApiError(400, "Invalid exam date");
    const today = new Date();
    const days = Math.max(
      1,
      Math.ceil((exam.getTime() - today.getTime()) / 86400000)
    );

    const { data: mastery } = await supabase
      .from("topic_mastery")
      .select("topic, mastery_score")
      .eq("course_id", id);

    // Fall back to topics from quiz questions if no mastery yet.
    let topics = (mastery ?? []).map((m) => ({
      topic: m.topic,
      score: Math.round(m.mastery_score * 100),
    }));
    if (topics.length === 0) {
      const { data: qs } = await supabase
        .from("quiz_questions")
        .select("topic")
        .eq("user_id", course.user_id)
        .limit(200);
      const set = new Set((qs ?? []).map((q) => q.topic));
      topics = [...set].map((t) => ({ topic: t, score: 50 }));
    }

    const prompt = `A student preparing for "${course.name}" has an exam in ${days} day(s). Their topic mastery scores (0-100): ${JSON.stringify(
      topics
    )}. Available study time: ${hoursPerDay} hours/day. Create a specific day-by-day study plan that prioritizes weak topics and includes review/practice. Return JSON: [{ "day": 1, "date": "YYYY-MM-DD", "topics": ["..."], "tasks": ["..."] }]. Produce exactly ${days} day entries starting from today (${today
      .toISOString()
      .slice(0, 10)}).`;

    const plan = await generateJSON<StudyPlanDay[]>(
      prompt,
      'You must respond with valid JSON only — an array of day objects. No markdown.'
    );

    return NextResponse.json({
      days,
      hoursPerDay,
      plan: Array.isArray(plan) ? plan : [],
    });
  });
}

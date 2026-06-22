import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { generateJSON } from "@/lib/ai/gemini";
import { gatherCourseContent } from "@/lib/content";
import {
  extractTopicsFromMaterials,
  filterMasteryToScope,
  parseExamTopicsInput,
  resolveStudyScope,
  type TopicScore,
} from "@/lib/study-plan-topics";
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
    const examTopicsRaw: string = String(body.examTopics ?? "").trim();
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

    const content = await gatherCourseContent(supabase, id);
    if (!content) {
      throw new ApiError(
        400,
        "No processed material content found. Upload materials and wait for processing first."
      );
    }

    const materialTopics = await extractTopicsFromMaterials(content, course.name);
    if (materialTopics.length === 0) {
      throw new ApiError(
        400,
        "Could not identify topics in your materials. Try uploading more content."
      );
    }

    const userTopics = parseExamTopicsInput(examTopicsRaw);
    const scopeTopics = resolveStudyScope(materialTopics, userTopics);

    const { data: mastery } = await supabase
      .from("topic_mastery")
      .select("topic, mastery_score")
      .eq("course_id", id);

    let topicScores: TopicScore[] = (mastery ?? []).map((m) => ({
      topic: m.topic,
      score: Math.round(m.mastery_score * 100),
    }));

    if (topicScores.length === 0) {
      const { data: quizzes } = await supabase
        .from("quizzes")
        .select("id")
        .eq("course_id", id);
      const quizIds = (quizzes ?? []).map((q) => q.id);
      if (quizIds.length > 0) {
        const { data: qs } = await supabase
          .from("quiz_questions")
          .select("topic")
          .in("quiz_id", quizIds)
          .limit(200);
        const set = new Set((qs ?? []).map((q) => q.topic));
        topicScores = [...set].map((t) => ({ topic: t, score: 50 }));
      }
    }

    topicScores = filterMasteryToScope(topicScores, scopeTopics);

    const scopeNote =
      userTopics.length > 0
        ? `The student specified these exam topics: ${JSON.stringify(userTopics)}. Plan ONLY for the scoped list below.`
        : "Plan for all topics in the scoped list (everything covered in their materials).";

    const prompt = `Build a day-by-day study plan for "${course.name}".

${scopeNote}

SCOPED TOPICS (you may ONLY use these — do not add any other topic):
${JSON.stringify(scopeTopics)}

Topics detected in uploaded materials (for reference):
${JSON.stringify(materialTopics)}

Topic mastery scores 0-100 (lower = weaker; prioritize these within the scoped list):
${JSON.stringify(topicScores.length > 0 ? topicScores : scopeTopics.map((t) => ({ topic: t, score: 50 })))}

Material excerpts (study tasks must stay faithful to this content):
${content.slice(0, 12000)}

Exam in ${days} day(s). Study time: ${hoursPerDay} hour(s)/day.
Start date: ${today.toISOString().slice(0, 10)}.

Rules:
- Every "topics" entry and every task must relate ONLY to items in SCOPED TOPICS.
- Do NOT mention concepts outside SCOPED TOPICS (no generic CS curriculum filler).
- Tasks should reference studying the student's actual material, not external resources.
- Spread scoped topics across ${days} day(s); weak topics earlier, review near the end.
- Each task should fit within ${hoursPerDay} hour(s)/day total per day.

Return JSON: [{ "day": 1, "date": "YYYY-MM-DD", "topics": ["..."], "tasks": ["..."] }]
Produce exactly ${days} entries.`;

    const plan = await generateJSON<StudyPlanDay[]>(
      prompt,
      'You must respond with valid JSON only — an array of day objects. No markdown. Use ONLY topics from the scoped list.'
    );

    return NextResponse.json({
      days,
      hoursPerDay,
      scopeTopics,
      materialTopics,
      plan: Array.isArray(plan) ? plan : [],
    });
  });
}

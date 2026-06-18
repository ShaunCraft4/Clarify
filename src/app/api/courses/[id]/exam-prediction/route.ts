import { NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { generateJSON } from "@/lib/ai/gemini";
import { gatherCourseContent } from "@/lib/content";
import type { ExamPrediction } from "@/lib/types";

export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);

    const content = await gatherCourseContent(supabase, id);
    if (!content) {
      throw new ApiError(
        400,
        "No processed material content found. Upload materials first."
      );
    }

    const prompt = `Analyze the following course materials (which may include lecture notes and past exams/homework). Based on emphasis, repetition, and patterns, predict the most likely exam topics. Return JSON: [{ "topic": "...", "confidence": 0-100, "rationale": "short reason" }], ranked by confidence descending, max 6 topics. Confidence values should sum to roughly 100.\n\nMATERIALS:\n${content}`;

    const predictions = await generateJSON<ExamPrediction[]>(
      prompt,
      'You must respond with valid JSON only — an array of {"topic","confidence","rationale"}. No markdown.'
    );

    return NextResponse.json({
      predictions: (Array.isArray(predictions) ? predictions : []).sort(
        (a, b) => b.confidence - a.confidence
      ),
    });
  });
}

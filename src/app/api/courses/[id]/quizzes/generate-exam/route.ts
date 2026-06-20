import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { generateQuizFromMaterials } from "@/lib/quiz-generate";
import { computeExamReadiness } from "@/lib/exam-readiness";
import { isMissingTable } from "@/lib/db-schema";

export const maxDuration = 120;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user, course } = await requireCourse(id);
    const body = await req.json().catch(() => ({}));

    const timeLimitMinutes = Math.min(
      120,
      Math.max(10, Math.floor(Number(body.timeLimitMinutes) || 45))
    );

    const { data: rubric, error: rubricErr } = await supabase
      .from("course_rubrics")
      .select("extracted_text")
      .eq("course_id", id)
      .maybeSingle();

    const rubricText =
      rubricErr && isMissingTable(rubricErr) ? null : rubric?.extracted_text;

    const readiness = await computeExamReadiness(supabase, id);
    const focusTopics =
      readiness.weakTopics.length > 0
        ? readiness.weakTopics
        : ["General course review"];

    try {
      const result = await generateQuizFromMaterials({
        supabase,
        courseId: id,
        userId: user.id,
        courseName: course.name,
        counts: {
          multiple_choice: 8,
          true_false: 3,
          short_answer: 4,
        },
        rubricText,
        focusTopics,
        isExamSim: true,
        timeLimitMinutes,
      });
      return NextResponse.json({ ...result, timeLimitMinutes });
    } catch (err) {
      throw new ApiError(
        502,
        err instanceof Error ? err.message : "Exam generation failed"
      );
    }
  });
}

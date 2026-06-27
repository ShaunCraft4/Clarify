import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError, errorMessage } from "@/lib/api";
import { generateQuizFromMaterials } from "@/lib/quiz-generate";
import { isMissingTable } from "@/lib/db-schema";

export const maxDuration = 60;

interface TopicInput {
  title?: string;
  subtopics?: unknown;
}

function parseFocusTopics(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t: TopicInput) => {
      const title = String(t.title ?? "").trim();
      if (!title) return null;
      const subtopics = Array.isArray(t.subtopics)
        ? t.subtopics.map((s) => String(s).trim()).filter(Boolean)
        : [];
      return subtopics.length > 0
        ? `${title} (${subtopics.join(", ")})`
        : title;
    })
    .filter((t): t is string => Boolean(t))
    .slice(0, 8);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user, course } = await requireCourse(id);
    const body = await req.json().catch(() => ({}));

    const clamp = (v: unknown) =>
      Math.min(Math.max(Math.floor(Number(v) || 0), 0), 20);
    const counts = {
      multiple_choice: clamp(body.counts?.multiple_choice ?? 6),
      true_false: clamp(body.counts?.true_false ?? 2),
      short_answer: clamp(body.counts?.short_answer ?? 2),
    };
    const total =
      counts.multiple_choice + counts.true_false + counts.short_answer;
    if (total < 1) {
      throw new ApiError(400, "Choose at least one question.");
    }
    if (total > 30) {
      throw new ApiError(400, "Please keep the quiz to 30 questions or fewer.");
    }

    const { data: rubric, error: rubricErr } = await supabase
      .from("course_rubrics")
      .select("extracted_text")
      .eq("course_id", id)
      .maybeSingle();

    const rubricText =
      rubricErr && isMissingTable(rubricErr) ? null : rubric?.extracted_text;

    const focusTopics = parseFocusTopics(body.topics);

    try {
      const result = await generateQuizFromMaterials({
        supabase,
        courseId: id,
        userId: user.id,
        courseName: course.name,
        counts,
        rubricText: rubricText,
        focusTopics: focusTopics.length > 0 ? focusTopics : undefined,
      });
      return NextResponse.json(result);
    } catch (err) {
      throw new ApiError(502, errorMessage(err, "Generation failed"));
    }
  });
}

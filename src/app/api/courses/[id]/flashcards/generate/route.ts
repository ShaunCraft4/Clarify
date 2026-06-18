import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { generateJSON } from "@/lib/ai/gemini";
import { gatherCourseContent } from "@/lib/content";

export const maxDuration = 60;

interface GeneratedCard {
  question: string;
  answer: string;
  topic: string;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user } = await requireCourse(id);
    const body = await req.json().catch(() => ({}));
    const materialId: string | undefined = body.materialId;
    const count: number = Math.min(Math.max(Number(body.count) || 12, 4), 25);

    const content = await gatherCourseContent(supabase, id, materialId);
    if (!content) {
      throw new ApiError(
        400,
        "No processed material content found. Upload and wait for processing first."
      );
    }

    const prompt = `From the following course content, generate ${count} concise flashcard pairs. Focus on definitions, key concepts, and formulas. Each flashcard must include a specific "topic" label (e.g. "AVL Trees", "Graph Traversal"). Return a JSON array of objects: [{ "question": "...", "answer": "...", "topic": "..." }].\n\nCONTENT:\n${content}`;

    const cards = await generateJSON<GeneratedCard[]>(
      prompt,
      'You must respond with valid JSON only — a JSON array of {"question","answer","topic"}. No markdown, no code fences.'
    );

    const rows = (Array.isArray(cards) ? cards : [])
      .filter((c) => c.question && c.answer)
      .map((c) => ({
        course_id: id,
        user_id: user.id,
        question: c.question,
        answer: c.answer,
        topic: c.topic || "General",
      }));

    if (rows.length === 0) {
      throw new ApiError(502, "Generation produced no usable flashcards");
    }

    const { data, error } = await supabase
      .from("flashcards")
      .insert(rows)
      .select("*");
    if (error) throw error;

    return NextResponse.json({ flashcards: data, created: data.length });
  });
}

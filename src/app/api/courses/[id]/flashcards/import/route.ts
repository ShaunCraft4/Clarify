import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import {
  parseFlashcardImport,
  type ImportFormat,
} from "@/lib/flashcard-import";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user } = await requireCourse(id);
    const body = await req.json().catch(() => ({}));

    const content = String(body.content ?? "");
    const format = (body.format ?? "auto") as "auto" | ImportFormat;

    const parsed = parseFlashcardImport(content, format);
    if (!parsed.ok) {
      const detail = parsed.hint
        ? `${parsed.message} ${parsed.hint}`
        : parsed.message;
      throw new ApiError(400, detail);
    }

    const rows = parsed.cards.map((c) => ({
      course_id: id,
      user_id: user.id,
      question: c.question,
      answer: c.answer,
      topic: c.topic || "General",
    }));

    const { data, error } = await supabase
      .from("flashcards")
      .insert(rows)
      .select("*");
    if (error) throw error;

    return NextResponse.json({
      flashcards: data,
      imported: data.length,
      format: parsed.format,
    });
  });
}

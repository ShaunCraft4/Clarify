import { NextRequest, NextResponse } from "next/server";
import { handle, requireUser, ApiError } from "@/lib/api";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireUser();
    const body = await req.json();

    const update: Record<string, unknown> = {};
    if (body.mastered === true) update.mastered_at = new Date().toISOString();
    if (body.mastered === false) update.mastered_at = null;
    if (body.reviewed === true) {
      update.last_reviewed_at = new Date().toISOString();
    }

    // Increment review_count when reviewed.
    if (body.reviewed === true) {
      const { data: current } = await supabase
        .from("flashcards")
        .select("review_count")
        .eq("id", id)
        .single();
      update.review_count = (current?.review_count ?? 0) + 1;
    }

    const { data, error } = await supabase
      .from("flashcards")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error || !data) throw new ApiError(404, "Flashcard not found");

    return NextResponse.json({ flashcard: data });
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireUser();
    const { error } = await supabase.from("flashcards").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  });
}

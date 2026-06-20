import { NextRequest, NextResponse } from "next/server";
import { handle, requireUser, ApiError } from "@/lib/api";
import { scheduleReview, type ReviewRating } from "@/lib/srs";
import { isMissingColumn } from "@/lib/db-schema";

const RATINGS = new Set<ReviewRating>(["again", "good", "easy"]);

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireUser();
    const body = await req.json();

    let { data: current, error: fetchErr } = await supabase
      .from("flashcards")
      .select("review_count, ease_factor, interval_days")
      .eq("id", id)
      .single();

    if (isMissingColumn(fetchErr)) {
      ({ data: current, error: fetchErr } = await supabase
        .from("flashcards")
        .select("review_count")
        .eq("id", id)
        .single());
    }
    if (fetchErr || !current) throw new ApiError(404, "Flashcard not found");

    const update: Record<string, unknown> = {
      last_reviewed_at: new Date().toISOString(),
      review_count: (current.review_count ?? 0) + 1,
    };

    const hasSrs = "ease_factor" in current;

    if (body.rating && RATINGS.has(body.rating) && hasSrs) {
      const next = scheduleReview(
        body.rating as ReviewRating,
        Number(current.ease_factor ?? 2.5),
        Number(current.interval_days ?? 0),
        update.review_count as number
      );
      Object.assign(update, next);
    } else if (body.rating === "good" || body.rating === "easy") {
      update.mastered_at = new Date().toISOString();
    } else if (body.rating === "again") {
      update.mastered_at = null;
    } else {
      if (body.mastered === true) update.mastered_at = new Date().toISOString();
      if (body.mastered === false) update.mastered_at = null;
    }

    let { data, error } = await supabase
      .from("flashcards")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();

    if (isMissingColumn(error)) {
      const legacy: Record<string, unknown> = {
        last_reviewed_at: update.last_reviewed_at,
        review_count: update.review_count,
      };
      if (update.mastered_at !== undefined) {
        legacy.mastered_at = update.mastered_at;
      }
      ({ data, error } = await supabase
        .from("flashcards")
        .update(legacy)
        .eq("id", id)
        .select("*")
        .single());
    }
    if (error || !data) throw new ApiError(404, "Flashcard not found");

    return NextResponse.json({
      flashcard: {
        ...data,
        ease_factor: data.ease_factor ?? 2.5,
        interval_days: data.interval_days ?? 0,
        due_at: data.due_at ?? data.created_at,
      },
    });
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

import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);
    const { data, error } = await supabase
      .from("flashcards")
      .select("*")
      .eq("course_id", id)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ flashcards: data });
  });
}

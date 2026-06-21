import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";
import { assignCourseEmoji } from "@/lib/course-emoji";
import { isMissingColumn } from "@/lib/db-schema";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, course } = await requireCourse(id);

    if (course.emoji) {
      return NextResponse.json({ emoji: course.emoji });
    }

    try {
      const emoji = await assignCourseEmoji(supabase, id, course.name);
      return NextResponse.json({ emoji });
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "message" in err &&
        isMissingColumn(err as { code?: string; message?: string })
      ) {
        return NextResponse.json({ emoji: null });
      }
      throw err;
    }
  });
}

import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { assignCourseEmoji } from "@/lib/course-emoji";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, course } = await requireCourse(id);
    const body = await req.json();
    const update: Record<string, unknown> = {};
    let rename = false;
    if (typeof body.name === "string") {
      const name = body.name.trim();
      if (!name) throw new ApiError(400, "Course name is required");
      update.name = name;
      rename = name !== course.name;
    }
    if (typeof body.description === "string")
      update.description = body.description.trim() || null;
    const { data, error } = await supabase
      .from("courses")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;

    if (rename && typeof update.name === "string") {
      try {
        const emoji = await assignCourseEmoji(
          supabase,
          id,
          update.name as string
        );
        return NextResponse.json({ course: { ...data, emoji } });
      } catch {
        // emoji column may be missing — return course without blocking rename
      }
    }

    return NextResponse.json({ course: data });
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user } = await requireCourse(id);

    // Clean up stored files first (cascade handles DB rows).
    const admin = createAdminClient();
    const prefix = `${user.id}/${id}`;
    const { data: files } = await admin.storage.from("materials").list(prefix);
    if (files && files.length) {
      await admin.storage
        .from("materials")
        .remove(files.map((f) => `${prefix}/${f.name}`));
    }

    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  });
}

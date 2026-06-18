import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);
    const body = await req.json();
    const update: Record<string, unknown> = {};
    if (typeof body.name === "string") update.name = body.name.trim();
    if (typeof body.description === "string")
      update.description = body.description.trim() || null;
    const { data, error } = await supabase
      .from("courses")
      .update(update)
      .eq("id", id)
      .select("*")
      .single();
    if (error) throw error;
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

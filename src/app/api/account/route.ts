import { NextResponse } from "next/server";
import { handle, requireUser } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE() {
  return handle(async () => {
    const { user } = await requireUser();
    const admin = createAdminClient();

    const { data: courses } = await admin
      .from("courses")
      .select("id")
      .eq("user_id", user.id);

    for (const course of courses ?? []) {
      const prefix = `${user.id}/${course.id}`;
      const { data: files } = await admin.storage.from("materials").list(prefix);
      if (files?.length) {
        await admin.storage
          .from("materials")
          .remove(files.map((f) => `${prefix}/${f.name}`));
      }
    }

    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) throw error;

    return NextResponse.json({ ok: true });
  });
}

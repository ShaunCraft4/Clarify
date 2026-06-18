import { NextRequest, NextResponse } from "next/server";
import { handle, requireUser, ApiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user } = await requireUser();

    const { data: material, error } = await supabase
      .from("materials")
      .select("id, storage_path")
      .eq("id", id)
      .single();
    if (error || !material) throw new ApiError(404, "Material not found");

    if (material.storage_path) {
      const admin = createAdminClient();
      await admin.storage.from("materials").remove([material.storage_path]);
    }

    const { error: delErr } = await supabase
      .from("materials")
      .delete()
      .eq("id", id);
    if (delErr) throw delErr;

    return NextResponse.json({ ok: true });
  });
}

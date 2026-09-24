import { after } from "next/server";
import { NextRequest, NextResponse } from "next/server";
import { handle, requireUser, ApiError } from "@/lib/api";
import { processMaterial } from "@/lib/pipeline";
import type { FileType } from "@/lib/types";

export const maxDuration = 300;

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user } = await requireUser();

    const { data: material, error } = await supabase
      .from("materials")
      .select("id, course_id, user_id, file_type, storage_path, status")
      .eq("id", id)
      .single();
    if (error || !material) throw new ApiError(404, "Material not found");
    if (!material.storage_path) {
      throw new ApiError(400, "This material has no file to reprocess.");
    }

    await supabase.from("chunks").delete().eq("material_id", id);
    await supabase
      .from("materials")
      .update({
        status: "pending",
        error: null,
        chunk_count: 0,
        extracted_text: "",
      })
      .eq("id", id);

    after(() =>
      processMaterial({
        materialId: material.id,
        courseId: material.course_id,
        userId: user.id,
        storagePath: material.storage_path,
        fileType: material.file_type as FileType,
      })
    );

    return NextResponse.json({ ok: true });
  });
}

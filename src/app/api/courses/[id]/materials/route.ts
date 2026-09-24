import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { processMaterial } from "@/lib/pipeline";
import { isOwnedMaterialPath } from "@/lib/material-limits";
import type { FileType } from "@/lib/types";

export const maxDuration = 300;

const VALID_TYPES: FileType[] = ["pdf", "slides", "notes", "homework"];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);
    const { data, error } = await supabase
      .from("materials")
      .select(
        "id, course_id, file_name, file_type, status, error, chunk_count, uploaded_at, storage_path"
      )
      .eq("course_id", id)
      .order("uploaded_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ materials: data });
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { user } = await requireCourse(id);

    const body = await req.json().catch(() => null);
    const storagePath = String(body?.storagePath ?? "");
    const fileName = String(body?.fileName ?? "").trim();
    const fileType = String(body?.fileType || "pdf") as FileType;

    if (!fileName) {
      throw new ApiError(400, "No file name was provided.");
    }
    if (!VALID_TYPES.includes(fileType)) {
      throw new ApiError(400, "Invalid file type");
    }
    if (!isOwnedMaterialPath(storagePath, user.id, id)) {
      throw new ApiError(400, "Invalid storage path.");
    }

    const admin = createAdminClient();

    const { data: material, error: insErr } = await admin
      .from("materials")
      .insert({
        course_id: id,
        user_id: user.id,
        file_name: fileName,
        file_type: fileType,
        storage_path: storagePath,
        status: "pending",
      })
      .select("id, course_id, file_name, file_type, status, chunk_count, uploaded_at")
      .single();
    if (insErr) throw insErr;

    // Kick off processing in the background; the client polls for status.
    void processMaterial({
      materialId: material.id,
      courseId: id,
      userId: user.id,
      storagePath,
      fileType,
    });

    return NextResponse.json({ material }, { status: 201 });
  });
}

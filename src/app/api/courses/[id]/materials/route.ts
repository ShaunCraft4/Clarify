import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { processMaterial } from "@/lib/pipeline";
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

    const form = await req.formData();
    const file = form.get("file");
    const fileType = (form.get("fileType") || "pdf").toString() as FileType;

    if (!(file instanceof File)) {
      throw new ApiError(400, "No file uploaded");
    }
    if (!VALID_TYPES.includes(fileType)) {
      throw new ApiError(400, "Invalid file type");
    }

    const admin = createAdminClient();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const storagePath = `${user.id}/${id}/${Date.now()}-${safeName}`;

    const bytes = Buffer.from(await file.arrayBuffer());
    const { error: upErr } = await admin.storage
      .from("materials")
      .upload(storagePath, bytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
    if (upErr) throw new ApiError(500, `Upload failed: ${upErr.message}`);

    const { data: material, error: insErr } = await admin
      .from("materials")
      .insert({
        course_id: id,
        user_id: user.id,
        file_name: file.name,
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

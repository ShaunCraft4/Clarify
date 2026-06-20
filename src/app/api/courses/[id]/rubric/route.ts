import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { createAdminClient } from "@/lib/supabase/admin";
import { extractPdfText, extractPlainText } from "@/lib/pdf";
import { isMissingTable, MIGRATION_0002_HINT } from "@/lib/db-schema";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);
    const { data, error } = await supabase
      .from("course_rubrics")
      .select("id, file_name, uploaded_at")
      .eq("course_id", id)
      .maybeSingle();
    if (error) {
      if (isMissingTable(error)) {
        return NextResponse.json({ rubric: null });
      }
      throw error;
    }
    return NextResponse.json({ rubric: data });
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user } = await requireCourse(id);

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      throw new ApiError(400, "No file uploaded");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    const lower = file.name.toLowerCase();
    let text = "";
    if (lower.endsWith(".pdf")) {
      text = await extractPdfText(bytes);
    } else if (
      lower.endsWith(".txt") ||
      lower.endsWith(".md") ||
      lower.endsWith(".markdown")
    ) {
      text = extractPlainText(bytes);
    } else {
      throw new ApiError(
        400,
        "Unsupported file type. Upload a PDF, .txt, or .md rubric."
      );
    }

    if (!text || text.length < 20) {
      throw new ApiError(
        400,
        "Could not extract enough text from this rubric file."
      );
    }

    const admin = createAdminClient();
    const safeName = file.name.replace(/[^\w.\-]+/g, "_");
    const storagePath = `${user.id}/${id}/rubric-${Date.now()}-${safeName}`;

    await admin.storage.from("materials").upload(storagePath, bytes, {
      contentType: file.type || "application/octet-stream",
      upsert: true,
    });

    const { data: existing, error: existingErr } = await supabase
      .from("course_rubrics")
      .select("id, storage_path")
      .eq("course_id", id)
      .maybeSingle();

    if (existingErr && isMissingTable(existingErr)) {
      throw new ApiError(503, MIGRATION_0002_HINT);
    }

    if (existing?.storage_path) {
      await admin.storage.from("materials").remove([existing.storage_path]);
    }

    const row = {
      course_id: id,
      user_id: user.id,
      file_name: file.name,
      storage_path: storagePath,
      extracted_text: text,
      uploaded_at: new Date().toISOString(),
    };

    const { data, error } = existing
      ? await supabase
          .from("course_rubrics")
          .update(row)
          .eq("id", existing.id)
          .select("id, file_name, uploaded_at")
          .single()
      : await supabase
          .from("course_rubrics")
          .insert(row)
          .select("id, file_name, uploaded_at")
          .single();

    if (error) {
      if (isMissingTable(error)) {
        throw new ApiError(503, MIGRATION_0002_HINT);
      }
      throw error;
    }
    return NextResponse.json({ rubric: data });
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);

    const { data: existing, error: fetchErr } = await supabase
      .from("course_rubrics")
      .select("storage_path")
      .eq("course_id", id)
      .maybeSingle();

    if (fetchErr && isMissingTable(fetchErr)) {
      return NextResponse.json({ ok: true });
    }

    if (existing?.storage_path) {
      const admin = createAdminClient();
      await admin.storage.from("materials").remove([existing.storage_path]);
    }

    const { error } = await supabase
      .from("course_rubrics")
      .delete()
      .eq("course_id", id);
    if (error && !isMissingTable(error)) throw error;
    return NextResponse.json({ ok: true });
  });
}

import { createClient } from "@/lib/supabase/client";
import {
  MAX_MATERIAL_BYTES,
  formatBytes,
  materialStoragePath,
} from "@/lib/material-limits";

const BUCKET = "materials";

export { MAX_MATERIAL_BYTES, formatBytes };

export async function uploadMaterialToStorage(
  file: File,
  courseId: string
): Promise<string> {
  if (file.size === 0) {
    throw new Error("That file is empty.");
  }
  if (file.size > MAX_MATERIAL_BYTES) {
    throw new Error(
      `That file is ${formatBytes(file.size)} — the limit is ${formatBytes(
        MAX_MATERIAL_BYTES
      )}. Compress the PDF or split it into a couple of files.`
    );
  }

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in.");

  const storagePath = materialStoragePath(user.id, courseId, file.name);
  const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });

  if (error) {
    if (/maximum allowed size|too large|exceeded|payload/i.test(error.message)) {
      throw new Error(
        `Supabase rejected this file as too large (${formatBytes(file.size)}). In the dashboard: Storage → materials → raise the file size limit.`
      );
    }
    throw new Error(error.message || "Could not upload that file.");
  }

  return storagePath;
}

export async function removeMaterialFromStorage(storagePath: string): Promise<void> {
  const supabase = createClient();
  await supabase.storage.from(BUCKET).remove([storagePath]);
}

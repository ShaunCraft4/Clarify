import { formatBytes } from "@/lib/audio";

/**
 * Matches the usual Supabase free-tier per-file cap. The file never goes
 * through Next.js — the browser uploads straight to Storage — so this is the
 * real ceiling, not Vercel's 4.5 MB request-body limit.
 */
export const MAX_MATERIAL_BYTES = 50 * 1024 * 1024;

export { formatBytes };

export function materialStoragePath(
  userId: string,
  courseId: string,
  filename: string
): string {
  const safeName = filename.replace(/[^\w.\-]+/g, "_");
  return `${userId}/${courseId}/${Date.now()}-${safeName}`;
}

/** True when the path is this user's file for this course (no `..` tricks). */
export function isOwnedMaterialPath(
  storagePath: string,
  userId: string,
  courseId: string
): boolean {
  const expected = `${userId}/${courseId}/`;
  return (
    storagePath.startsWith(expected) &&
    !storagePath.includes("..") &&
    storagePath.length < 512
  );
}

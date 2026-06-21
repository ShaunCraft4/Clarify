/** Postgres / PostgREST errors when migration 0002 has not been applied yet. */
export function isMissingColumn(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  if (!error) return false;
  const msg = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    msg.includes("does not exist") ||
    (msg.includes("could not find") && msg.includes("column")) ||
    msg.includes("schema cache")
  );
}

export function isMissingTable(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  return (
    error?.code === "42P01" ||
    Boolean(error?.message?.includes("Could not find the table"))
  );
}

export const MIGRATION_0002_HINT =
  "Run supabase/migrations/0002_srs_rubric_exams.sql in the Supabase SQL editor to enable this feature.";

/** Detect exam sims when `is_exam_sim` column is not migrated yet. */
export function isExamSimTitle(title: string): boolean {
  return /exam simulation/i.test(title);
}

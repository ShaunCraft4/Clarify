/** Postgres / PostgREST errors when migration 0002 has not been applied yet. */
export function isMissingColumn(
  error: { code?: string; message?: string } | null | undefined
): boolean {
  return (
    error?.code === "42703" ||
    Boolean(error?.message?.includes("does not exist"))
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

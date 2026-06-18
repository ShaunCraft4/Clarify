import { createClient } from "@/lib/supabase/server";
import DashboardClient from "./DashboardClient";
import type { Course } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const supabase = await createClient();
  const { data: courses } = await supabase
    .from("courses")
    .select("*")
    .order("created_at", { ascending: false });

  // Per-course quick stats.
  const ids = (courses ?? []).map((c) => c.id);
  const stats: Record<string, { materials: number; flashcards: number }> = {};
  if (ids.length) {
    const [{ data: mats }, { data: cards }] = await Promise.all([
      supabase.from("materials").select("course_id").in("course_id", ids),
      supabase.from("flashcards").select("course_id").in("course_id", ids),
    ]);
    for (const id of ids) stats[id] = { materials: 0, flashcards: 0 };
    for (const m of mats ?? []) stats[m.course_id].materials++;
    for (const c of cards ?? []) stats[c.course_id].flashcards++;
  }

  return (
    <DashboardClient
      initialCourses={(courses as Course[]) ?? []}
      stats={stats}
    />
  );
}

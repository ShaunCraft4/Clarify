import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import CourseWorkspace from "./CourseWorkspace";
import type { Course } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function CoursePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("courses")
    .select("*")
    .eq("id", id)
    .single();

  if (!course) notFound();

  return <CourseWorkspace course={course as Course} />;
}

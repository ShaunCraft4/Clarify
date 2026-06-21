import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import NavigationProgress from "@/components/NavigationProgress";
import type { Course } from "@/lib/types";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  let courses: Pick<Course, "id" | "name" | "description" | "emoji">[] = [];
  const full = await supabase
    .from("courses")
    .select("id, name, description, emoji")
    .order("created_at", { ascending: true });

  if (full.error) {
    const basic = await supabase
      .from("courses")
      .select("id, name, description")
      .order("created_at", { ascending: true });
    courses = (basic.data ?? []).map((c) => ({ ...c, emoji: null }));
  } else {
    courses = full.data ?? [];
  }

  return (
    <div className="flex min-h-screen">
      <Suspense>
        <NavigationProgress />
      </Suspense>
      <Sidebar courses={courses} email={user.email ?? ""} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

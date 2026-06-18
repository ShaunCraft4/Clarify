import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Sidebar from "@/components/Sidebar";
import NavigationProgress from "@/components/NavigationProgress";

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

  const { data: courses } = await supabase
    .from("courses")
    .select("id, name")
    .order("created_at", { ascending: true });

  return (
    <div className="flex min-h-screen">
      <Suspense>
        <NavigationProgress />
      </Suspense>
      <Sidebar courses={courses ?? []} email={user.email ?? ""} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}

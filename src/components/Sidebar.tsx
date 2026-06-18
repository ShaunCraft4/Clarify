"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/cn";
import {
  BrainCircuit,
  LayoutDashboard,
  BookOpen,
  LogOut,
  Loader2,
} from "lucide-react";
import type { Course } from "@/lib/types";

/** Shows a spinner on a Link while its navigation is pending. */
function LinkSpinner({ fallback }: { fallback: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
  ) : (
    <>{fallback}</>
  );
}

export default function Sidebar({
  courses,
  email,
}: {
  courses: Pick<Course, "id" | "name">[];
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  async function signOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
      <div className="p-5 border-b border-slate-200">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-lg font-bold text-brand-700"
        >
          <BrainCircuit className="h-6 w-6" />
          Clarify
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-3 space-y-1">
        <Link
          href="/dashboard"
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium",
            pathname === "/dashboard"
              ? "bg-brand-50 text-brand-700"
              : "text-slate-600 hover:bg-slate-100"
          )}
        >
          <LinkSpinner fallback={<LayoutDashboard className="h-4 w-4" />} />
          Dashboard
        </Link>

        <div className="pt-4 pb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Courses
        </div>
        {courses.length === 0 && (
          <p className="px-3 py-2 text-sm text-slate-400">No courses yet</p>
        )}
        {courses.map((c) => {
          const href = `/courses/${c.id}`;
          const active = pathname.startsWith(href);
          return (
            <Link
              key={c.id}
              href={href}
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium truncate",
                active
                  ? "bg-brand-50 text-brand-700"
                  : "text-slate-600 hover:bg-slate-100"
              )}
            >
              <LinkSpinner fallback={<BookOpen className="h-4 w-4 shrink-0" />} />
              <span className="truncate">{c.name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-slate-200 p-3">
        <div className="px-2 pb-2 text-xs text-slate-500 truncate">{email}</div>
        <button
          onClick={signOut}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}

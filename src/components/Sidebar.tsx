"use client";

import Link from "next/link";
import { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { apiFetch } from "@/lib/fetcher";
import { cn } from "@/lib/cn";
import { courseAccentColor } from "@/lib/course-emoji";
import {
  getPinnedCourses,
  getRecentCourses,
  recordRecentCourse,
  togglePinnedCourse,
} from "@/lib/sidebar-prefs";
import { SIDEBAR_SUMMARY_EVENT } from "@/lib/course-cache";
import {
  getStudyStreak,
  loadStudyStreak,
  STUDY_STREAK_EVENT,
  type StudyStreakState,
} from "@/lib/study-streak";
import type { Course } from "@/lib/types";
import {
  BrainCircuit,
  LayoutDashboard,
  LogOut,
  Loader2,
  Trash2,
  Plus,
  Pin,
  PinOff,
  X,
  Target,
  Layers,
  ListChecks,
  ArrowRight,
  Flame,
} from "lucide-react";

type SidebarCourse = Pick<Course, "id" | "name" | "description" | "emoji">;

interface SidebarSummary {
  examReadiness: number;
  dueCount: number;
  lastQuizScore: number | null;
}

function LinkSpinner({ fallback }: { fallback: React.ReactNode }) {
  const { pending } = useLinkStatus();
  return pending ? (
    <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
  ) : (
    <>{fallback}</>
  );
}

function userInitials(email: string): string {
  const local = email.split("@")[0] ?? email;
  const parts = local.split(/[._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return local.slice(0, 2).toUpperCase();
}

function CourseIcon({
  course,
  active,
}: {
  course: SidebarCourse;
  active: boolean;
}) {
  const color = courseAccentColor(course.id);
  return (
    <span
      className={cn(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-base leading-none",
        active ? "ring-2 ring-brand-400 ring-offset-1" : ""
      )}
      style={{ backgroundColor: `${color}22` }}
      aria-hidden
    >
      {course.emoji ?? "📚"}
    </span>
  );
}

function groupCourses(
  courses: SidebarCourse[],
  pinned: string[],
  recent: string[]
) {
  const byId = new Map(courses.map((c) => [c.id, c]));
  const pinnedCourses = pinned
    .map((id) => byId.get(id))
    .filter((c): c is SidebarCourse => Boolean(c));
  const recentCourses = recent
    .filter((id) => !pinned.includes(id))
    .map((id) => byId.get(id))
    .filter((c): c is SidebarCourse => Boolean(c));
  const seen = new Set([...pinned, ...recent]);
  const rest = courses
    .filter((c) => !seen.has(c.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  return { pinnedCourses, recentCourses, rest };
}

export default function Sidebar({
  courses: initialCourses,
  email,
}: {
  courses: SidebarCourse[];
  email: string;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const [courses, setCourses] = useState(initialCourses);
  const [pinned, setPinned] = useState<string[]>([]);
  const [recent, setRecent] = useState<string[]>([]);
  const [prefsReady, setPrefsReady] = useState(false);

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [creatingBusy, setCreatingBusy] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  const [summary, setSummary] = useState<SidebarSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [streak, setStreak] = useState<StudyStreakState>({
    streak: 0,
    lastStudyDate: null,
  });
  const [processingCount, setProcessingCount] = useState(0);

  const activeCourseId = useMemo(() => {
    const match = pathname.match(/^\/courses\/([^/]+)/);
    return match?.[1] ?? null;
  }, [pathname]);

  const activeCourse = useMemo(
    () => courses.find((c) => c.id === activeCourseId) ?? null,
    [courses, activeCourseId]
  );

  useEffect(() => {
    setCourses(initialCourses);
  }, [initialCourses]);

  useEffect(() => {
    setPinned(getPinnedCourses());
    setRecent(getRecentCourses());
    setPrefsReady(true);
  }, []);

  useEffect(() => {
    // Instant paint from the local cache, then reconcile with the account so
    // the streak matches across browsers/devices.
    setStreak(getStudyStreak());
    void loadStudyStreak();
    function onStreak(e: Event) {
      setStreak((e as CustomEvent<StudyStreakState>).detail);
    }
    window.addEventListener(STUDY_STREAK_EVENT, onStreak);
    return () => window.removeEventListener(STUDY_STREAK_EVENT, onStreak);
  }, []);

  useEffect(() => {
    function onProcessing(e: Event) {
      const detail = (e as CustomEvent<{ courseId: string; processingCount: number }>)
        .detail;
      if (detail.courseId === activeCourseId) {
        setProcessingCount(detail.processingCount);
      }
    }
    window.addEventListener("clarify:material-processing", onProcessing);
    return () =>
      window.removeEventListener("clarify:material-processing", onProcessing);
  }, [activeCourseId]);

  useEffect(() => {
    if (!activeCourseId) setProcessingCount(0);
  }, [activeCourseId]);

  useEffect(() => {
    if (activeCourseId) {
      recordRecentCourse(activeCourseId);
      setRecent(getRecentCourses());
    }
  }, [activeCourseId]);

  useEffect(() => {
    if (!prefsReady || !activeCourseId) {
      setSummary(null);
      return;
    }

    let cancelled = false;

    function loadSummary() {
      setSummaryLoading(true);
      apiFetch<SidebarSummary>(`/api/courses/${activeCourseId}/sidebar-summary`)
        .then((data) => {
          if (!cancelled) setSummary(data);
        })
        .catch(() => {
          if (!cancelled) setSummary(null);
        })
        .finally(() => {
          if (!cancelled) setSummaryLoading(false);
        });
    }

    loadSummary();

    function onRefresh(e: Event) {
      const detail = (e as CustomEvent<{ courseId?: string }>).detail;
      if (detail?.courseId && detail.courseId !== activeCourseId) return;
      loadSummary();
    }

    window.addEventListener(SIDEBAR_SUMMARY_EVENT, onRefresh);
    return () => {
      cancelled = true;
      window.removeEventListener(SIDEBAR_SUMMARY_EVENT, onRefresh);
    };
  }, [activeCourseId, prefsReady]);

  const emojiRequested = useRef(new Set<string>());

  useEffect(() => {
    for (const c of initialCourses) {
      if (c.emoji || emojiRequested.current.has(c.id)) continue;
      emojiRequested.current.add(c.id);
      apiFetch<{ emoji: string | null }>(`/api/courses/${c.id}/emoji`, {
        method: "POST",
      })
        .then(({ emoji }) => {
          if (!emoji) return;
          setCourses((prev) =>
            prev.map((row) => (row.id === c.id ? { ...row, emoji } : row))
          );
        })
        .catch(() => {
          emojiRequested.current.delete(c.id);
        });
    }
  }, [initialCourses]);

  const grouped = useMemo(
    () => groupCourses(courses, pinned, recent),
    [courses, pinned, recent]
  );

  async function signOut() {
    setSigningOut(true);
    try {
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch (err) {
      setSigningOut(false);
      alert(err instanceof Error ? err.message : "Could not sign out");
    }
  }

  async function deleteAccount() {
    if (deleteConfirmText !== "DELETE") return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch("/api/account", { method: "DELETE" });
      await supabase.auth.signOut();
      router.push("/login");
      router.refresh();
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Could not delete account"
      );
      setDeleting(false);
    }
  }

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreatingBusy(true);
    setCreateError(null);
    try {
      const { course } = await apiFetch<{ course: Course }>("/api/courses", {
        method: "POST",
        body: JSON.stringify({
          name: newName.trim(),
          description: newDescription.trim(),
        }),
      });
      setCreating(false);
      setNewName("");
      setNewDescription("");
      router.push(`/courses/${course.id}`);
      router.refresh();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create course");
    } finally {
      setCreatingBusy(false);
    }
  }

  function handleTogglePin(e: React.MouseEvent, courseId: string) {
    e.preventDefault();
    e.stopPropagation();
    setPinned(togglePinnedCourse(courseId));
  }

  function renderCourseLink(c: SidebarCourse) {
    const href = `/courses/${c.id}`;
    const active = pathname.startsWith(href);
    const isPinned = pinned.includes(c.id);

    return (
      <div key={c.id} className="group relative">
        <Link
          href={href}
          className={cn(
            "flex items-start gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
            active
              ? "bg-brand-50 text-brand-800 border border-brand-200 shadow-sm"
              : "text-slate-600 hover:bg-slate-100 border border-transparent"
          )}
        >
          <CourseIcon course={c} active={active} />
          <span className="min-w-0 flex-1 pr-6">
            <span className="block truncate">{c.name}</span>
            {active && c.description && (
              <span className="block truncate text-xs font-normal text-slate-500 mt-0.5">
                {c.description}
              </span>
            )}
          </span>
        </Link>
        <button
          type="button"
          onClick={(e) => handleTogglePin(e, c.id)}
          title={isPinned ? "Unpin course" : "Pin course"}
          className={cn(
            "absolute right-2 top-2.5 rounded-md p-1 transition-opacity",
            isPinned
              ? "text-brand-600 opacity-100"
              : "text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-white/80 hover:text-brand-600"
          )}
        >
          {isPinned ? (
            <Pin className="h-3.5 w-3.5 fill-current" />
          ) : (
            <PinOff className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
    );
  }

  function renderCourseSection(
    label: string,
    items: SidebarCourse[],
    showLabel: boolean
  ) {
    if (items.length === 0) return null;
    return (
      <div className="space-y-1">
        {showLabel && (
          <div className="px-3 pt-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            {label}
          </div>
        )}
        {items.map(renderCourseLink)}
      </div>
    );
  }

  const hasGroups =
    grouped.pinnedCourses.length > 0 || grouped.recentCourses.length > 0;

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200 flex flex-col h-screen sticky top-0">
      <div className="p-4 border-b border-slate-200 space-y-3">
        <Link
          href="/dashboard"
          className="flex items-center gap-2 text-lg font-bold text-brand-700"
        >
          <BrainCircuit className="h-6 w-6" />
          Clarify
        </Link>
        <div className="flex items-center justify-between rounded-lg bg-orange-50 border border-orange-100 px-3 py-2">
          <span className="text-xs font-medium text-orange-800/80">
            Study streak
          </span>
          <span className="flex items-center gap-1.5 text-sm font-bold text-orange-700">
            {streak.streak}
            <Flame className="h-4 w-4 text-orange-500" aria-hidden />
          </span>
        </div>
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2 text-sm font-medium text-brand-700 hover:bg-brand-100"
        >
          <Plus className="h-4 w-4" />
          New course
        </button>
      </div>

      {activeCourse && (
        <div className="mx-3 mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mb-2">
            At a glance
          </p>
          <p className="text-sm font-semibold text-slate-800 truncate">
            {activeCourse.emoji && (
              <span className="mr-1.5">{activeCourse.emoji}</span>
            )}
            {activeCourse.name}
          </p>
          {summaryLoading ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading stats…
            </div>
          ) : summary ? (
            <div className="mt-3 space-y-2 text-xs text-slate-600">
              <div className="flex items-center gap-2">
                <Target className="h-3.5 w-3.5 text-brand-600 shrink-0" />
                <span>
                  Exam readiness{" "}
                  <strong className="text-slate-800">{summary.examReadiness}%</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                <span>
                  <strong
                    className={
                      summary.dueCount > 0 ? "text-amber-700" : "text-slate-800"
                    }
                  >
                    {summary.dueCount}
                  </strong>{" "}
                  flashcard{summary.dueCount === 1 ? "" : "s"} due
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ListChecks className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                <span>
                  {summary.lastQuizScore != null ? (
                    <>
                      Last quiz{" "}
                      <strong className="text-slate-800">
                        {summary.lastQuizScore}%
                      </strong>
                    </>
                  ) : (
                    <span className="text-slate-400">No quizzes yet</span>
                  )}
                </span>
              </div>
              {processingCount > 0 && (
                <div className="flex items-center gap-2 text-amber-700">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" />
                  <span>
                    <strong>{processingCount}</strong> file
                    {processingCount === 1 ? "" : "s"} processing
                  </span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}

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

        {courses.length === 0 ? (
          <div className="pt-3">
            <div className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Courses
            </div>
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-left hover:border-brand-200 hover:bg-brand-50 transition-colors"
            >
              <p className="text-sm font-medium text-slate-700">
                Create your first course
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Upload materials and start studying.
              </p>
              <span className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-brand-600">
                Get started
                <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          </div>
        ) : (
          <>
            {!hasGroups && (
              <div className="pt-4 pb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Courses
              </div>
            )}
            {renderCourseSection("Pinned", grouped.pinnedCourses, hasGroups)}
            {renderCourseSection("Recent", grouped.recentCourses, hasGroups)}
            {renderCourseSection(
              hasGroups ? "All courses" : "Courses",
              grouped.rest,
              hasGroups
            )}
          </>
        )}
      </nav>

      <div className="border-t border-slate-200 p-3 space-y-2">
        <div className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-xs font-bold text-white">
            {userInitials(email)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-800 truncate">{email}</p>
            <p className="text-[10px] text-slate-400">Signed in</p>
          </div>
        </div>
        <button
          onClick={signOut}
          disabled={signingOut || deleting}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
        >
          {signingOut ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <LogOut className="h-4 w-4" />
          )}
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
        <button
          onClick={() => {
            setDeleteError(null);
            setShowDeleteConfirm(true);
          }}
          disabled={signingOut || deleting}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
        >
          <Trash2 className="h-4 w-4" />
          Delete account
        </button>
      </div>

      {creating && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="modal-panel w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New course</h2>
              <button
                type="button"
                onClick={() => setCreating(false)}
                disabled={creatingBusy}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-100 disabled:opacity-60"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={createCourse} className="space-y-4">
              <input
                autoFocus
                placeholder="Course name (e.g. CS141)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <textarea
                placeholder="Description (optional)"
                value={newDescription}
                onChange={(e) => setNewDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              {createError && (
                <p className="text-sm text-red-600">{createError}</p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  disabled={creatingBusy}
                  className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingBusy}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {creatingBusy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-labelledby="delete-account-title"
          >
            <h2
              id="delete-account-title"
              className="text-lg font-semibold text-slate-900"
            >
              Delete your account?
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              This permanently deletes all your courses, materials, flashcards,
              quizzes, and uploaded files. This cannot be undone.
            </p>
            <p className="mt-4 text-sm text-slate-600">
              Type <span className="font-mono font-semibold">DELETE</span> to
              confirm:
            </p>
            <input
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              disabled={deleting}
              className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 disabled:opacity-60"
              placeholder="DELETE"
              autoFocus
            />
            {deleteError && (
              <p className="mt-3 text-sm text-red-600">{deleteError}</p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText("");
                  setDeleteError(null);
                }}
                disabled={deleting}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={deleteAccount}
                disabled={deleting || deleteConfirmText !== "DELETE"}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                {deleting ? "Deleting…" : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      )}

      {(signingOut || deleting) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-8 py-7 shadow-xl">
            <Loader2 className="h-9 w-9 animate-spin text-brand-600" />
            <p className="text-sm font-medium text-slate-700">
              {signingOut ? "Signing out…" : "Deleting your account…"}
            </p>
            <p className="text-xs text-slate-500">
              {signingOut
                ? "See you next time."
                : "Removing your courses and data."}
            </p>
          </div>
        </div>
      )}
    </aside>
  );
}

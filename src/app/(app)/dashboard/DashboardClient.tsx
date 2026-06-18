"use client";

import { useState } from "react";
import Link from "next/link";
import { useLinkStatus } from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/fetcher";
import ThemeToggle from "@/components/ThemeToggle";
import type { Course } from "@/lib/types";
import {
  Plus,
  BookOpen,
  FileText,
  Layers,
  Trash2,
  Pencil,
  X,
  Loader2,
  AlertTriangle,
} from "lucide-react";

type Stats = Record<string, { materials: number; flashcards: number }>;

/** Swaps the card icon for a spinner while the course page is loading. */
function CardIcon() {
  const { pending } = useLinkStatus();
  return pending ? (
    <Loader2 className="h-5 w-5 animate-spin" />
  ) : (
    <BookOpen className="h-5 w-5" />
  );
}

export default function DashboardClient({
  initialCourses,
  stats,
}: {
  initialCourses: Course[];
  stats: Stats;
}) {
  const router = useRouter();
  const [courses, setCourses] = useState(initialCourses);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Course | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function createCourse(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const { course } = await apiFetch<{ course: Course }>("/api/courses", {
        method: "POST",
        body: JSON.stringify({ name, description }),
      });
      setCourses((c) => [course, ...c]);
      setName("");
      setDescription("");
      setCreating(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create course");
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleting(true);
    try {
      await apiFetch(`/api/courses/${id}`, { method: "DELETE" });
      setCourses((c) => c.filter((x) => x.id !== id));
      setDeleteTarget(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete course");
    } finally {
      setDeleting(false);
    }
  }

  async function renameCourse(course: Course) {
    const newName = prompt("Rename course", course.name);
    if (!newName || newName.trim() === course.name) return;
    const { course: updated } = await apiFetch<{ course: Course }>(
      `/api/courses/${course.id}`,
      { method: "PATCH", body: JSON.stringify({ name: newName.trim() }) }
    );
    setCourses((c) => c.map((x) => (x.id === course.id ? updated : x)));
    router.refresh();
  }

  return (
    <div className="p-8 max-w-6xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">Your courses</h1>
          <p className="text-slate-500 mt-1">
            Each course has its own isolated material library.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            New course
          </button>
          <ThemeToggle />
        </div>
      </div>

      {courses.length === 0 && !creating && (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <BookOpen className="h-10 w-10 mx-auto text-slate-300" />
          <h3 className="mt-4 font-semibold text-slate-700">No courses yet</h3>
          <p className="text-slate-500 mt-1">
            Create your first course to start uploading materials.
          </p>
          <button
            onClick={() => setCreating(true)}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700"
          >
            <Plus className="h-4 w-4" />
            Create course
          </button>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {courses.map((course) => (
          <div
            key={course.id}
            className="group relative rounded-2xl border border-slate-200 bg-white p-5 hover:shadow-md transition-shadow"
          >
            <div className="absolute top-3 right-3 flex gap-1 opacity-70 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => renameCourse(course)}
                className="p-1.5 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Rename course"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                onClick={() => setDeleteTarget(course)}
                className="p-1.5 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                title="Delete course"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <Link href={`/courses/${course.id}`} className="block">
              <div className="h-10 w-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                <CardIcon />
              </div>
              <h3 className="mt-3 font-semibold text-lg truncate">
                {course.name}
              </h3>
              {course.description && (
                <p className="text-sm text-slate-500 mt-1 line-clamp-2">
                  {course.description}
                </p>
              )}
              <div className="mt-4 flex gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1">
                  <FileText className="h-4 w-4" />
                  {stats[course.id]?.materials ?? 0} materials
                </span>
                <span className="flex items-center gap-1">
                  <Layers className="h-4 w-4" />
                  {stats[course.id]?.flashcards ?? 0} cards
                </span>
              </div>
            </Link>
          </div>
        ))}
      </div>

      {creating && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">New course</h2>
              <button
                onClick={() => setCreating(false)}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={createCourse} className="space-y-4">
              <input
                autoFocus
                placeholder="Course name (e.g. CS141)"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              <textarea
                placeholder="Description (optional)"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreating(false)}
                  className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !deleting && setDeleteTarget(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 shrink-0 rounded-full bg-red-50 text-red-600 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold">Delete course?</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Are you sure you want to delete{" "}
                  <b className="text-slate-700">{deleteTarget.name}</b>? This
                  permanently removes all of its materials, flashcards,
                  quizzes, and progress. This cannot be undone.
                </p>
              </div>
            </div>
            {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                disabled={deleting}
                className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDelete}
                disabled={deleting}
                className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {deleting && <Loader2 className="h-4 w-4 animate-spin" />}
                Delete course
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

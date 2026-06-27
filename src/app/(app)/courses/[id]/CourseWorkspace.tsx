"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import type { Course } from "@/lib/types";
import { apiFetch } from "@/lib/fetcher";
import { cn } from "@/lib/cn";
import {
  prefetchCourseTab,
  prefetchCourseTabs,
  type TabPrefetchId,
} from "@/lib/course-cache";
import { useCourseMaterials } from "@/hooks/useCourseMaterials";
import { useMaterialProcessingToasts } from "@/hooks/useMaterialProcessingToasts";
import {
  FileText,
  MessageCircleQuestion,
  Search,
  Layers,
  ListChecks,
  BarChart3,
  CalendarDays,
  Sparkles,
  NotebookPen,
  Pencil,
  X,
  Loader2,
} from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";
import MaterialsTab from "./tabs/MaterialsTab";
import AskTab from "./tabs/AskTab";
import SearchTab from "./tabs/SearchTab";
import NotesTab from "./tabs/NotesTab";
import FlashcardsTab from "./tabs/FlashcardsTab";
import QuizzesTab from "./tabs/QuizzesTab";
import ProgressTab from "./tabs/ProgressTab";
import StudyPlanTab from "./tabs/StudyPlanTab";
import InsightsTab from "./tabs/InsightsTab";

const TABS = [
  { id: "materials", label: "Materials", icon: FileText },
  { id: "ask", label: "Ask", icon: MessageCircleQuestion },
  { id: "search", label: "Search", icon: Search },
  { id: "notes", label: "Notes", icon: NotebookPen },
  { id: "flashcards", label: "Flashcards", icon: Layers },
  { id: "quizzes", label: "Quizzes and Exams", icon: ListChecks },
  { id: "progress", label: "Progress", icon: BarChart3 },
  { id: "plan", label: "Study Plan", icon: CalendarDays },
  { id: "insights", label: "Insights", icon: Sparkles },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function CourseWorkspace({ course: initialCourse }: { course: Course }) {
  const router = useRouter();
  const [course, setCourse] = useState(initialCourse);
  const [tab, setTab] = useState<TabId>("materials");
  const [highlightMaterialId, setHighlightMaterialId] = useState<string | null>(
    null
  );
  const [mounted, setMounted] = useState<Set<TabId>>(
    () => new Set(["materials", "ask"])
  );

  const { materials, processingCount } = useCourseMaterials(course.id);
  useMaterialProcessingToasts(course.id, materials, processingCount);

  useEffect(() => {
    prefetchCourseTabs(course.id);
  }, [course.id]);

  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(course.name);
  const [editDescription, setEditDescription] = useState(course.description ?? "");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const selectTab = useCallback((id: TabId) => {
    setTab(id);
    setMounted((prev) => new Set(prev).add(id));
  }, []);

  function openEdit() {
    setEditName(course.name);
    setEditDescription(course.description ?? "");
    setEditError(null);
    setEditing(true);
  }

  function openMaterial(materialId: string) {
    setHighlightMaterialId(materialId);
    selectTab("materials");
  }

  async function saveCourse(e: React.FormEvent) {
    e.preventDefault();
    const name = editName.trim();
    if (!name) {
      setEditError("Course name is required.");
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      const { course: updated } = await apiFetch<{ course: Course }>(
        `/api/courses/${course.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            name,
            description: editDescription.trim(),
          }),
        }
      );
      setCourse(updated);
      setEditing(false);
      router.refresh();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update course");
    } finally {
      setSaving(false);
    }
  }

  function tabPanelClass(active: boolean, ask = false) {
    return cn(ask ? "flex h-full min-h-0 flex-col" : "", !active && "hidden");
  }

  function renderTab(
    id: TabId,
    active: boolean,
    children: React.ReactNode,
    ask = false
  ) {
    if (!mounted.has(id)) return null;
    return (
      <div
        className={cn(
          tabPanelClass(active, ask),
          active && !ask && "animate-tab-in"
        )}
      >
        {children}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b border-slate-200 bg-white px-8 pt-6 shadow-sm z-10">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold truncate">{course.name}</h1>
              <button
                type="button"
                onClick={openEdit}
                className="shrink-0 rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Edit course name and description"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </div>
            {course.description ? (
              <p className="text-slate-500 mt-1">{course.description}</p>
            ) : (
              <p className="text-slate-400 mt-1 text-sm italic">No description</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
        </div>
        <nav className="flex gap-1 mt-4 -mb-px overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            const showProcessingBadge =
              t.id === "materials" && processingCount > 0;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                onMouseEnter={() =>
                  prefetchCourseTab(course.id, t.id as TabPrefetchId)
                }
                className={cn(
                  "relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap rounded-t-lg",
                  active
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
                {showProcessingBadge && (
                  <span className="absolute top-1.5 right-1 h-2 w-2 rounded-full bg-amber-500" />
                )}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto bg-slate-50 min-h-0">
        {renderTab(
          "ask",
          tab === "ask",
          <AskTab
            courseId={course.id}
            courseName={course.name}
            onOpenMaterial={openMaterial}
          />,
          true
        )}
        {renderTab(
          "materials",
          tab === "materials",
          <MaterialsTab
            courseId={course.id}
            onGoToNotes={() => selectTab("notes")}
            highlightMaterialId={highlightMaterialId}
            onHighlightDone={() => setHighlightMaterialId(null)}
          />
        )}
        {renderTab(
          "search",
          tab === "search",
          <SearchTab courseId={course.id} onOpenMaterial={openMaterial} />
        )}
        {renderTab(
          "notes",
          tab === "notes",
          <NotesTab courseId={course.id} />
        )}
        {renderTab(
          "flashcards",
          tab === "flashcards",
          <FlashcardsTab courseId={course.id} />
        )}
        {renderTab(
          "quizzes",
          tab === "quizzes",
          <QuizzesTab courseId={course.id} />
        )}
        {renderTab(
          "progress",
          tab === "progress",
          <ProgressTab courseId={course.id} />
        )}
        {renderTab(
          "plan",
          tab === "plan",
          <StudyPlanTab courseId={course.id} courseName={course.name} />
        )}
        {renderTab(
          "insights",
          tab === "insights",
          <InsightsTab courseId={course.id} />
        )}
      </div>

      {editing && (
        <div className="modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="modal-panel w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Edit course</h2>
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={saving}
                className="p-1 rounded-md text-slate-400 hover:bg-slate-100 disabled:opacity-60"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={saveCourse} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Course name
                </label>
                <input
                  autoFocus
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  placeholder="Optional — exam date, professor, topics covered…"
                  rows={3}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                />
              </div>
              {editError && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
                  {editError}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  disabled={saving}
                  className="rounded-lg px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
                >
                  {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                  Save
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

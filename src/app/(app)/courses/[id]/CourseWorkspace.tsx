"use client";

import { useState } from "react";
import type { Course } from "@/lib/types";
import { cn } from "@/lib/cn";
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
} from "lucide-react";
import UsageMeter from "@/components/UsageMeter";
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
  { id: "quizzes", label: "Quizzes", icon: ListChecks },
  { id: "progress", label: "Progress", icon: BarChart3 },
  { id: "plan", label: "Study Plan", icon: CalendarDays },
  { id: "insights", label: "Insights", icon: Sparkles },
] as const;

type TabId = (typeof TABS)[number]["id"];

export default function CourseWorkspace({ course }: { course: Course }) {
  const [tab, setTab] = useState<TabId>("materials");

  return (
    <div className="flex flex-col h-screen">
      <header className="border-b border-slate-200 bg-white px-8 pt-6 shadow-sm z-10">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{course.name}</h1>
            {course.description && (
              <p className="text-slate-500 mt-1">{course.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <UsageMeter />
            <ThemeToggle />
          </div>
        </div>
        <nav className="flex gap-1 mt-4 -mb-px overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={cn(
                  "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap rounded-t-lg",
                  active
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50"
                )}
              >
                <Icon className="h-4 w-4" />
                {t.label}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="flex-1 overflow-y-auto bg-slate-50">
        {/* key forces a remount per tab so the fade-in plays on every switch */}
        <div key={tab} className="animate-tab-in">
          {tab === "materials" && (
            <MaterialsTab
              courseId={course.id}
              onGoToNotes={() => setTab("notes")}
            />
          )}
          {tab === "ask" && (
            <AskTab courseId={course.id} courseName={course.name} />
          )}
          {tab === "search" && <SearchTab courseId={course.id} />}
          {tab === "notes" && <NotesTab courseId={course.id} />}
          {tab === "flashcards" && <FlashcardsTab courseId={course.id} />}
          {tab === "quizzes" && <QuizzesTab courseId={course.id} />}
          {tab === "progress" && <ProgressTab courseId={course.id} />}
          {tab === "plan" && <StudyPlanTab courseId={course.id} />}
          {tab === "insights" && <InsightsTab courseId={course.id} />}
        </div>
      </div>
    </div>
  );
}

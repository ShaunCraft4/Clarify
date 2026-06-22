"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import ActivityProgress, { ACTIVITY_ESTIMATES } from "@/components/ActivityProgress";
import type { StudyPlanDay } from "@/lib/types";
import { studyPlanToIcs } from "@/lib/study-plan-ics";
import { downloadTextFile } from "@/lib/flashcard-export";
import { recordStudyActivity } from "@/lib/study-streak";
import {
  CalendarDays,
  Loader2,
  CheckCircle2,
  BookOpen,
  Trash2,
  Download,
} from "lucide-react";

interface SavedPlan {
  plan: StudyPlanDay[];
  examDate: string;
  hoursPerDay: number;
  examTopics?: string;
}

export default function StudyPlanTab({
  courseId,
  courseName = "Course",
}: {
  courseId: string;
  courseName?: string;
}) {
  const storageKey = `clarify:studyplan:${courseId}`;
  const [examDate, setExamDate] = useState("");
  const [examTopics, setExamTopics] = useState("");
  const [hoursPerDay, setHoursPerDay] = useState(2);
  const [plan, setPlan] = useState<StudyPlanDay[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  // Load a saved plan, discarding it if the exam has already passed.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved: SavedPlan = JSON.parse(raw);
        if (saved.examDate && saved.examDate >= today) {
          setPlan(saved.plan);
          setExamDate(saved.examDate);
          setHoursPerDay(saved.hoursPerDay);
          setExamTopics(saved.examTopics ?? "");
        } else {
          localStorage.removeItem(storageKey);
        }
      }
    } catch {
      /* ignore */
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  async function generate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const { plan } = await apiFetch<{ plan: StudyPlanDay[] }>(
        `/api/courses/${courseId}/study-plan`,
        {
          method: "POST",
          body: JSON.stringify({ examDate, hoursPerDay, examTopics }),
        }
      );
      setPlan(plan);
      recordStudyActivity();
      if (hydrated) {
        try {
          localStorage.setItem(
            storageKey,
            JSON.stringify({
              plan,
              examDate,
              hoursPerDay,
              examTopics,
            } satisfies SavedPlan)
          );
        } catch {
          /* ignore */
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate plan");
    } finally {
      setLoading(false);
    }
  }

  function downloadCalendar() {
    if (!plan?.length) return;
    const ics = studyPlanToIcs(plan, courseName, hoursPerDay);
    downloadTextFile(ics, "study-plan.ics", "text/calendar;charset=utf-8");
  }

  function clearPlan() {
    if (!confirm("Clear this study plan?")) return;
    setPlan(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <h2 className="text-lg font-semibold mb-1">Personalized study plan</h2>
      <p className="text-sm text-slate-500 mb-6">
        Built only from your uploaded materials. We prioritize weak topics from
        quiz results when available.
      </p>

      <form
        onSubmit={generate}
        className="space-y-4 rounded-xl border border-slate-200 bg-white p-5 mb-8"
      >
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Exam date
            </label>
            <input
              type="date"
              required
              min={today}
              value={examDate}
              onChange={(e) => setExamDate(e.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-600 mb-1">
              Hours per day
            </label>
            <input
              type="number"
              min={0.5}
              max={12}
              step={0.5}
              value={hoursPerDay}
              onChange={(e) => setHoursPerDay(Number(e.target.value))}
              className="w-28 rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CalendarDays className="h-4 w-4" />
            )}
            Generate plan
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1">
            What&apos;s on the exam?{" "}
            <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <textarea
            value={examTopics}
            onChange={(e) => setExamTopics(e.target.value)}
            placeholder="e.g. B-trees, red-black trees, splay trees — leave blank to study everything in your materials"
            rows={2}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <p className="mt-1 text-xs text-slate-400">
            Comma- or line-separated. Only topics that appear in your materials
            will be included.
          </p>
        </div>
      </form>

      <ActivityProgress
        active={loading}
        label="Building your study plan…"
        estimateSeconds={ACTIVITY_ESTIMATES.studyPlan}
        hint="Reading your materials and scheduling scoped topics only."
      />

      {error && (
        <p className="mb-4 text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {plan && (
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-slate-700">
            Your plan{examDate ? ` (exam ${examDate})` : ""}
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadCalendar}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <Download className="h-4 w-4" />
              Download .ics
            </button>
            <button
              onClick={clearPlan}
              className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              <Trash2 className="h-4 w-4" />
              Clear plan
            </button>
          </div>
        </div>
      )}

      {plan && (
        <div className="relative space-y-4 before:absolute before:left-[18px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
          {plan.map((day) => (
            <div key={day.day} className="relative pl-12">
              <div className="absolute left-0 top-1 h-9 w-9 rounded-full bg-brand-600 text-white flex items-center justify-center text-sm font-bold">
                {day.day}
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Day {day.day}</h3>
                  <span className="text-xs text-slate-400">{day.date}</span>
                </div>
                {day.topics?.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {day.topics.map((t, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 bg-brand-50 rounded-full px-2 py-0.5"
                      >
                        <BookOpen className="h-3 w-3" />
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                <ul className="mt-3 space-y-1.5">
                  {day.tasks?.map((task, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-slate-600">
                      <CheckCircle2 className="h-4 w-4 text-slate-300 mt-0.5 shrink-0" />
                      {task}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

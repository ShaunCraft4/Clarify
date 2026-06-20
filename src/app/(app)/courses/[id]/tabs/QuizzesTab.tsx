"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import ActivityProgress, { ACTIVITY_ESTIMATES } from "@/components/ActivityProgress";
import type { QuizQuestionPublic, TopicBreakdown } from "@/lib/types";
import { cn } from "@/lib/cn";
import {
  Sparkles,
  Loader2,
  ListChecks,
  ChevronRight,
  Trash2,
  Trophy,
  Check,
  X as XIcon,
  Plus,
  Minus,
  Timer,
  Upload,
  FileText,
} from "lucide-react";

function CountStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="text-xs font-medium text-slate-500 mb-2">{label}</p>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => onChange(Math.max(0, value - 1))}
          className="h-7 w-7 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 flex items-center justify-center"
        >
          <Minus className="h-4 w-4" />
        </button>
        <span className="text-lg font-semibold tabular-nums">{value}</span>
        <button
          type="button"
          onClick={() => onChange(Math.min(20, value + 1))}
          className="h-7 w-7 rounded-md border border-slate-300 text-slate-600 hover:bg-slate-100 flex items-center justify-center"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

interface QuizSummary {
  id: string;
  title: string;
  created_at: string;
  questionCount: number;
  bestScore: number | null;
  is_exam_sim?: boolean;
  time_limit_minutes?: number | null;
}

interface GradedResult {
  questionId: string;
  answer: string;
  correct: boolean;
  correctAnswer: string;
  topic: string;
  feedback?: string;
}

interface AttemptResult {
  score: number;
  correctCount: number;
  total: number;
  topicBreakdown: TopicBreakdown[];
  results: GradedResult[];
}

interface RubricInfo {
  id: string;
  file_name: string;
  uploaded_at: string;
}

export default function QuizzesTab({ courseId }: { courseId: string }) {
  const [view, setView] = useState<"list" | "taking" | "results">("list");
  const [quizzes, setQuizzes] = useState<QuizSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [generatingExam, setGeneratingExam] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rubric, setRubric] = useState<RubricInfo | null>(null);
  const [uploadingRubric, setUploadingRubric] = useState(false);

  const [questions, setQuestions] = useState<QuizQuestionPublic[]>([]);
  const [activeQuizId, setActiveQuizId] = useState<string | null>(null);
  const [timeLimitMinutes, setTimeLimitMinutes] = useState<number | null>(null);
  const [isExamSim, setIsExamSim] = useState(false);
  const [startingId, setStartingId] = useState<string | null>(null);
  const [result, setResult] = useState<AttemptResult | null>(null);

  const [counts, setCounts] = useState({
    multiple_choice: 6,
    true_false: 2,
    short_answer: 2,
  });
  const total =
    counts.multiple_choice + counts.true_false + counts.short_answer;

  const load = useCallback(async () => {
    const [{ quizzes }, rubricData] = await Promise.all([
      apiFetch<{ quizzes: QuizSummary[] }>(`/api/courses/${courseId}/quizzes`),
      apiFetch<{ rubric: RubricInfo | null }>(
        `/api/courses/${courseId}/rubric`
      ),
    ]);
    setQuizzes(quizzes);
    setRubric(rubricData.rubric);
    setLoading(false);
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  async function generate() {
    setGenerating(true);
    setError(null);
    try {
      const { quizId } = await apiFetch<{ quizId: string }>(
        `/api/courses/${courseId}/quizzes/generate`,
        { method: "POST", body: JSON.stringify({ counts }) }
      );
      await load();
      await startQuiz(quizId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  }

  async function generateExam() {
    setGeneratingExam(true);
    setError(null);
    try {
      const { quizId, timeLimitMinutes: limit } = await apiFetch<{
        quizId: string;
        timeLimitMinutes: number;
      }>(`/api/courses/${courseId}/quizzes/generate-exam`, {
        method: "POST",
        body: JSON.stringify({ timeLimitMinutes: 45 }),
      });
      await load();
      await startQuiz(quizId, limit, true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Exam generation failed");
    } finally {
      setGeneratingExam(false);
    }
  }

  async function startQuiz(
    quizId: string,
    limit?: number | null,
    examSim?: boolean
  ) {
    setStartingId(quizId);
    try {
      const { quiz } = await apiFetch<{
        quiz: {
          questions: QuizQuestionPublic[];
          time_limit_minutes?: number | null;
          is_exam_sim?: boolean;
        };
      }>(`/api/quizzes/${quizId}`);
      setQuestions(quiz.questions);
      setActiveQuizId(quizId);
      setTimeLimitMinutes(limit ?? quiz.time_limit_minutes ?? null);
      setIsExamSim(examSim ?? Boolean(quiz.is_exam_sim));
      setResult(null);
      setView("taking");
    } finally {
      setStartingId(null);
    }
  }

  async function deleteQuiz(quizId: string) {
    if (!confirm("Delete this quiz?")) return;
    setQuizzes((q) => q.filter((x) => x.id !== quizId));
    await apiFetch(`/api/quizzes/${quizId}`, { method: "DELETE" }).catch(
      () => {}
    );
  }

  async function uploadRubric(file: File) {
    setUploadingRubric(true);
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const { rubric: r } = await apiFetch<{ rubric: RubricInfo }>(
        `/api/courses/${courseId}/rubric`,
        { method: "POST", body: form }
      );
      setRubric(r);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rubric upload failed");
    } finally {
      setUploadingRubric(false);
    }
  }

  async function removeRubric() {
    if (!confirm("Remove the grading rubric?")) return;
    await apiFetch(`/api/courses/${courseId}/rubric`, { method: "DELETE" });
    setRubric(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (view === "taking" && activeQuizId) {
    return (
      <TakeQuiz
        quizId={activeQuizId}
        questions={questions}
        timeLimitMinutes={timeLimitMinutes}
        isExamSim={isExamSim}
        onDone={(r) => {
          setResult(r);
          setView("results");
          load();
        }}
        onCancel={() => setView("list")}
      />
    );
  }

  if (view === "results" && result) {
    return (
      <Results
        result={result}
        isExamSim={isExamSim}
        onClose={() => setView("list")}
      />
    );
  }

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <FileText className="h-4 w-4 text-brand-600" />
          Grading rubric
        </h3>
        <p className="text-sm text-slate-500 mt-1 mb-3">
          Upload your syllabus or grading rubric (PDF, .txt, or .md). It stays
          until you remove it and is used to grade short answers and tune
          question difficulty.
        </p>
        {rubric ? (
          <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-emerald-800">
                {rubric.file_name}
              </p>
              <p className="text-xs text-emerald-700">
                Uploaded {new Date(rubric.uploaded_at).toLocaleDateString()}
              </p>
            </div>
            <button
              onClick={removeRubric}
              className="text-sm text-red-600 hover:underline"
            >
              Remove
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed border-slate-200 px-4 py-6 text-sm text-slate-500 hover:border-brand-300 hover:bg-brand-50/50">
            <Upload className="h-4 w-4" />
            {uploadingRubric ? "Uploading…" : "Upload rubric"}
            <input
              type="file"
              accept=".pdf,.txt,.md,.markdown"
              className="hidden"
              disabled={uploadingRubric}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadRubric(f);
                e.target.value = "";
              }}
            />
          </label>
        )}
      </div>

      <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-5">
        <h3 className="font-semibold text-slate-800 flex items-center gap-2">
          <Timer className="h-4 w-4 text-amber-600" />
          Exam simulation
        </h3>
        <p className="text-sm text-slate-600 mt-1 mb-3">
          Timed 45-minute exam focused on your weak topics
          {rubric ? " using your rubric" : ""}. 15 questions (MCQ, T/F, short
          answer).
        </p>
        <button
          onClick={generateExam}
          disabled={generatingExam}
          className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 font-medium text-white hover:bg-amber-700 disabled:opacity-60"
        >
          {generatingExam ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Building exam…
            </>
          ) : (
            <>
              <Sparkles className="h-4 w-4" />
              Start exam simulation
            </>
          )}
        </button>
        <ActivityProgress
          active={generatingExam}
          label="Building your exam simulation…"
          estimateSeconds={ACTIVITY_ESTIMATES.quiz + 15}
          hint="Prioritizing weak topics and exam-style questions."
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5">
        <p className="text-sm font-medium text-slate-700 mb-3">
          Practice quiz
        </p>
        <div className="grid sm:grid-cols-3 gap-3">
          <CountStepper
            label="Multiple choice"
            value={counts.multiple_choice}
            onChange={(v) =>
              setCounts((c) => ({ ...c, multiple_choice: v }))
            }
          />
          <CountStepper
            label="True / False"
            value={counts.true_false}
            onChange={(v) => setCounts((c) => ({ ...c, true_false: v }))}
          />
          <CountStepper
            label="Short answer"
            value={counts.short_answer}
            onChange={(v) => setCounts((c) => ({ ...c, short_answer: v }))}
          />
        </div>
        <div className="flex items-center justify-between mt-4">
          <span className="text-sm text-slate-500">
            {total} question{total === 1 ? "" : "s"} total
          </span>
          <button
            onClick={generate}
            disabled={generating || total < 1}
            className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 font-medium text-white hover:bg-brand-700 disabled:opacity-60"
          >
            {generating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate quiz
              </>
            )}
          </button>
        </div>
        <ActivityProgress
          active={generating}
          label="Generating your quiz…"
          estimateSeconds={ACTIVITY_ESTIMATES.quiz}
          hint={`Creating ${total} questions from your course materials.`}
        />
      </div>

      {error && (
        <p className="text-sm text-red-600 bg-red-50 border border-red-100 rounded-lg px-3 py-2">
          {error}
        </p>
      )}

      {quizzes.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center">
          <ListChecks className="h-10 w-10 mx-auto text-slate-300" />
          <p className="mt-3 text-slate-500">
            No quizzes yet. Generate a practice quiz or exam simulation.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-600">Your quizzes</h3>
          {quizzes.map((q) => (
            <div
              key={q.id}
              className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 hover:shadow-sm"
            >
              <div
                className={cn(
                  "h-9 w-9 rounded-lg flex items-center justify-center",
                  q.is_exam_sim
                    ? "bg-amber-50 text-amber-600"
                    : "bg-brand-50 text-brand-600"
                )}
              >
                {q.is_exam_sim ? (
                  <Timer className="h-5 w-5" />
                ) : (
                  <ListChecks className="h-5 w-5" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{q.title}</p>
                <p className="text-xs text-slate-400">
                  {q.questionCount} questions
                  {q.is_exam_sim && q.time_limit_minutes
                    ? ` · ${q.time_limit_minutes} min`
                    : ""}
                  {q.bestScore !== null && ` · best ${q.bestScore}%`}
                </p>
              </div>
              <button
                onClick={() => deleteQuiz(q.id)}
                className="p-2 rounded-md text-slate-300 hover:bg-red-50 hover:text-red-600 opacity-0 group-hover:opacity-100"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() =>
                  startQuiz(q.id, q.time_limit_minutes, q.is_exam_sim)
                }
                disabled={startingId === q.id}
                className="flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-60"
              >
                {startingId === q.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    Start <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TakeQuiz({
  quizId,
  questions,
  timeLimitMinutes,
  isExamSim,
  onDone,
  onCancel,
}: {
  quizId: string;
  questions: QuizQuestionPublic[];
  timeLimitMinutes: number | null;
  isExamSim: boolean;
  onDone: (r: AttemptResult) => void;
  onCancel: () => void;
}) {
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState<number | null>(
    timeLimitMinutes ? timeLimitMinutes * 60 : null
  );
  const submittedRef = useRef(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const q = questions[i];
  const isLast = i === questions.length - 1;
  const current = answers[q.id] ?? "";

  const submit = useCallback(async () => {
    if (submittedRef.current) return;
    submittedRef.current = true;
    setSubmitting(true);
    try {
      const result = await apiFetch<AttemptResult>(
        `/api/quizzes/${quizId}/attempt`,
        {
          method: "POST",
          body: JSON.stringify({
            answers: Object.entries(answersRef.current).map(
              ([questionId, answer]) => ({
                questionId,
                answer,
              })
            ),
          }),
        }
      );
      onDone(result);
    } finally {
      setSubmitting(false);
    }
  }, [onDone, quizId]);

  useEffect(() => {
    if (!timeLimitMinutes) return;
    const endAt = Date.now() + timeLimitMinutes * 60 * 1000;
    const t = setInterval(() => {
      const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        clearInterval(t);
        void submit();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [timeLimitMinutes, submit]);

  const mins = secondsLeft !== null ? Math.floor(secondsLeft / 60) : 0;
  const secs = secondsLeft !== null ? secondsLeft % 60 : 0;

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={onCancel}
          className="text-sm text-slate-500 hover:text-slate-800"
        >
          Cancel
        </button>
        <div className="flex items-center gap-3 text-sm text-slate-500">
          {isExamSim && secondsLeft !== null && (
            <span
              className={cn(
                "font-mono font-semibold tabular-nums",
                secondsLeft < 300 ? "text-red-600" : "text-slate-700"
              )}
            >
              <Timer className="inline h-3.5 w-3.5 mr-1" />
              {mins}:{secs.toString().padStart(2, "0")}
            </span>
          )}
          <span>
            {i + 1} / {questions.length}
          </span>
        </div>
      </div>
      <div className="h-2 bg-slate-200 rounded-full mb-6">
        <div
          className="h-2 bg-brand-600 rounded-full transition-all"
          style={{ width: `${((i + 1) / questions.length) * 100}%` }}
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6">
        <span className="inline-block text-xs font-medium text-brand-700 bg-brand-50 rounded-full px-2 py-0.5 mb-3">
          {q.topic}
        </span>
        <p className="text-lg font-semibold mb-4">{q.question}</p>

        {q.options ? (
          <div className="space-y-2">
            {q.options.map((opt) => (
              <button
                key={opt}
                onClick={() =>
                  setAnswers((a) => ({ ...a, [q.id]: opt }))
                }
                className={cn(
                  "w-full text-left rounded-lg border px-4 py-2.5",
                  current === opt
                    ? "border-brand-500 bg-brand-50 text-brand-800"
                    : "border-slate-200 hover:bg-slate-50"
                )}
              >
                {opt}
              </button>
            ))}
          </div>
        ) : (
          <textarea
            value={current}
            onChange={(e) =>
              setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
            }
            rows={3}
            placeholder="Type your answer…"
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
        )}
      </div>

      <div className="flex justify-between mt-6">
        <button
          onClick={() => setI((x) => Math.max(0, x - 1))}
          disabled={i === 0}
          className="rounded-lg border border-slate-300 px-4 py-2 font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-40"
        >
          Previous
        </button>
        {isLast ? (
          <button
            onClick={() => void submit()}
            disabled={submitting}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2 font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            Submit {isExamSim ? "exam" : "quiz"}
          </button>
        ) : (
          <button
            onClick={() => setI((x) => Math.min(questions.length - 1, x + 1))}
            className="rounded-lg bg-brand-600 px-5 py-2 font-medium text-white hover:bg-brand-700"
          >
            Next
          </button>
        )}
      </div>
    </div>
  );
}

function Results({
  result,
  isExamSim,
  onClose,
}: {
  result: AttemptResult;
  isExamSim: boolean;
  onClose: () => void;
}) {
  const color =
    result.score >= 80
      ? "text-emerald-600"
      : result.score >= 60
        ? "text-amber-500"
        : "text-red-500";

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <Trophy className="h-10 w-10 mx-auto text-amber-400" />
        <p className="text-sm text-slate-500 mt-2">
          {isExamSim ? "Exam simulation" : "Quiz"} complete
        </p>
        <p className={cn("text-5xl font-bold mt-2", color)}>{result.score}%</p>
        <p className="text-slate-500 mt-1">
          {result.correctCount} of {result.total} correct
        </p>
      </div>

      <h3 className="font-semibold text-slate-700 mt-8 mb-2">By topic</h3>
      <div className="space-y-2">
        {result.topicBreakdown.map((t) => {
          const pct = Math.round((t.correct / t.total) * 100);
          return (
            <div
              key={t.topic}
              className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
            >
              <span className="flex-1 text-sm font-medium">{t.topic}</span>
              <div className="w-32 h-2 bg-slate-200 rounded-full">
                <div
                  className={cn(
                    "h-2 rounded-full",
                    pct >= 80
                      ? "bg-emerald-500"
                      : pct >= 60
                        ? "bg-amber-400"
                        : "bg-red-500"
                  )}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-slate-500 w-16 text-right">
                {t.correct}/{t.total}
              </span>
            </div>
          );
        })}
      </div>

      <h3 className="font-semibold text-slate-700 mt-8 mb-2">Review</h3>
      <div className="space-y-2">
        {result.results.map((r, idx) => (
          <div
            key={r.questionId}
            className={cn(
              "rounded-lg border p-3 text-sm",
              r.correct
                ? "border-emerald-200 bg-emerald-50"
                : "border-red-200 bg-red-50"
            )}
          >
            <div className="flex items-center gap-2">
              {r.correct ? (
                <Check className="h-4 w-4 text-emerald-600" />
              ) : (
                <XIcon className="h-4 w-4 text-red-600" />
              )}
              <span className="font-medium">Question {idx + 1}</span>
              <span className="text-xs text-slate-400">· {r.topic}</span>
            </div>
            <p className="mt-1 text-slate-600">
              Your answer: <b>{r.answer || "—"}</b>
            </p>
            {!r.correct && (
              <p className="text-slate-600">
                Correct answer: <b>{r.correctAnswer}</b>
              </p>
            )}
            {r.feedback && (
              <p className="text-slate-600 mt-1 italic">{r.feedback}</p>
            )}
          </div>
        ))}
      </div>

      <button
        onClick={onClose}
        className="mt-8 w-full rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700"
      >
        Back to Quizzes and Exams
      </button>
    </div>
  );
}

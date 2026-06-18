"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Cell,
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
  CartesianGrid,
} from "recharts";
import { Loader2, ListChecks, Layers, BarChart3, Target } from "lucide-react";

interface MasteryRow {
  topic: string;
  mastery_score: number;
  attempts_count: number;
}
interface AttemptRow {
  score: number;
  completed_at: string;
}
interface ProgressData {
  mastery: MasteryRow[];
  attempts: AttemptRow[];
  stats: {
    quizzesCompleted: number;
    flashcardsTotal: number;
    flashcardsMastered: number;
    topicsTracked: number;
  };
}

function masteryColor(score: number) {
  if (score >= 0.8) return "#10b981";
  if (score >= 0.6) return "#f59e0b";
  return "#ef4444";
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2 text-slate-400">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium uppercase tracking-wide">
          {label}
        </span>
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

export default function ProgressTab({ courseId }: { courseId: string }) {
  const [data, setData] = useState<ProgressData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const d = await apiFetch<ProgressData>(
      `/api/courses/${courseId}/progress`
    );
    setData(d);
    setLoading(false);
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const chartData = data.mastery.map((m) => ({
    topic: m.topic.length > 18 ? m.topic.slice(0, 17) + "…" : m.topic,
    score: Math.round(m.mastery_score * 100),
  }));

  const lineData = data.attempts.map((a, i) => ({
    name: `#${i + 1}`,
    score: a.score,
  }));

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          icon={ListChecks}
          label="Quizzes"
          value={data.stats.quizzesCompleted}
        />
        <Stat
          icon={Layers}
          label="Cards mastered"
          value={`${data.stats.flashcardsMastered}/${data.stats.flashcardsTotal}`}
        />
        <Stat
          icon={Target}
          label="Topics tracked"
          value={data.stats.topicsTracked}
        />
        <Stat
          icon={BarChart3}
          label="Avg score"
          value={
            data.attempts.length
              ? `${Math.round(
                  data.attempts.reduce((s, a) => s + a.score, 0) /
                    data.attempts.length
                )}%`
              : "—"
          }
        />
      </div>

      <section>
        <h3 className="font-semibold text-slate-700 mb-3">Topic mastery</h3>
        {chartData.length === 0 ? (
          <p className="text-sm text-slate-500">
            Take a quiz to start tracking topic mastery.
          </p>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <ResponsiveContainer width="100%" height={Math.max(220, chartData.length * 38)}>
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ left: 20, right: 30 }}
              >
                <XAxis type="number" domain={[0, 100]} unit="%" />
                <YAxis
                  type="category"
                  dataKey="topic"
                  width={120}
                  tick={{ fontSize: 12 }}
                />
                <Tooltip formatter={(v) => `${v}%`} />
                <Bar dataKey="score" radius={[0, 4, 4, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={masteryColor(d.score / 100)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="flex gap-4 text-xs text-slate-500 mt-2 justify-center">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500" /> &lt;60%
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-amber-400" /> 60–80%
              </span>
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-emerald-500" /> &gt;80%
              </span>
            </div>
          </div>
        )}
      </section>

      {lineData.length > 0 && (
        <section>
          <h3 className="font-semibold text-slate-700 mb-3">
            Quiz scores over time
          </h3>
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={lineData} margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#eef2f7" />
                <XAxis dataKey="name" />
                <YAxis domain={[0, 100]} unit="%" />
                <Tooltip formatter={(v) => `${v}%`} />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="#1d54f5"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
    </div>
  );
}

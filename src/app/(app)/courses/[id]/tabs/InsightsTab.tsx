"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import type { ExamPrediction, GapRecommendation } from "@/lib/types";
import DependencyGraphView, {
  type GraphNode,
  type GraphEdge,
} from "@/components/DependencyGraphView";
import {
  AlertTriangle,
  Loader2,
  TrendingUp,
  Network,
  Link2,
  FileText,
  Sparkles,
} from "lucide-react";

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex items-start gap-3 mb-4">
        <div className="h-10 w-10 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center shrink-0">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h3 className="font-semibold">{title}</h3>
          <p className="text-sm text-slate-500">{description}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function RunButton({
  onClick,
  loading,
  label,
}: {
  onClick: () => void;
  loading: boolean;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="flex items-center gap-2 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-60"
    >
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        <Sparkles className="h-4 w-4" />
      )}
      {label}
    </button>
  );
}

export default function InsightsTab({ courseId }: { courseId: string }) {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <GapAnalysis courseId={courseId} />
      <ExamPredictionCard courseId={courseId} />
      <DependencyGraphCard courseId={courseId} />
      <HomeworkLinking courseId={courseId} />
    </div>
  );
}

function GapAnalysis({ courseId }: { courseId: string }) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<{
    ready: boolean;
    message?: string;
    recommendations?: GapRecommendation[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setData(await apiFetch(`/api/courses/${courseId}/gap-analysis`, { method: "POST" }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section
      icon={AlertTriangle}
      title="Knowledge gap detection"
      description="Find your weakest topics and what to review before improving."
    >
      <RunButton onClick={run} loading={loading} label="Run gap analysis" />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {data && !data.ready && (
        <p className="mt-3 text-sm text-amber-600 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          {data.message}
        </p>
      )}
      {data?.ready && data.recommendations && (
        <div className="mt-4 space-y-3">
          {data.recommendations.map((r, i) => {
            const pct = Math.round(r.masteryScore * 100);
            return (
              <div
                key={i}
                className="rounded-xl border border-red-100 bg-red-50/50 p-4"
              >
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-800">
                    {r.topic}
                  </span>
                  <span className="text-xs font-medium text-red-600 bg-red-100 rounded-full px-2 py-0.5">
                    {pct}% mastery
                  </span>
                </div>
                <p className="text-sm text-slate-600 mt-2">
                  Before improving, review:{" "}
                  <b>{r.prerequisites.join(", ")}</b>
                </p>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}

function ExamPredictionCard({ courseId }: { courseId: string }) {
  const [loading, setLoading] = useState(false);
  const [predictions, setPredictions] = useState<ExamPrediction[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      const { predictions } = await apiFetch<{ predictions: ExamPrediction[] }>(
        `/api/courses/${courseId}/exam-prediction`,
        { method: "POST" }
      );
      setPredictions(predictions);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section
      icon={TrendingUp}
      title="Exam prediction"
      description="Likely exam topics based on lecture emphasis and past materials."
    >
      <RunButton onClick={run} loading={loading} label="Predict exam topics" />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {predictions && (
        <div className="mt-4 space-y-2">
          {predictions.map((p, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-3">
              <div className="flex items-center justify-between mb-1">
                <span className="font-medium">{p.topic}</span>
                <span className="text-sm font-semibold text-brand-600">
                  {Math.round(p.confidence)}%
                </span>
              </div>
              <div className="h-2 bg-slate-200 rounded-full">
                <div
                  className="h-2 bg-brand-600 rounded-full"
                  style={{ width: `${Math.min(100, p.confidence)}%` }}
                />
              </div>
              {p.rationale && (
                <p className="text-xs text-slate-500 mt-1.5">{p.rationale}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

function DependencyGraphCard({ courseId }: { courseId: string }) {
  const [loading, setLoading] = useState(false);
  const [graph, setGraph] = useState<{
    nodes: GraphNode[];
    edges: GraphEdge[];
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setLoading(true);
    setError(null);
    try {
      setGraph(
        await apiFetch(`/api/courses/${courseId}/dependency-graph`, {
          method: "POST",
        })
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section
      icon={Network}
      title="Learning dependency graph"
      description="How the course concepts build on each other. Node color = mastery."
    >
      <RunButton onClick={run} loading={loading} label="Build graph" />
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {graph && graph.nodes.length > 0 && (
        <div className="mt-4">
          <DependencyGraphView nodes={graph.nodes} edges={graph.edges} />
        </div>
      )}
    </Section>
  );
}

interface HomeworkLink {
  question: string;
  relevant: { materialName: string; excerpt: string; similarity: number }[];
}

function HomeworkLinking({ courseId }: { courseId: string }) {
  const [materials, setMaterials] = useState<
    { id: string; file_name: string; file_type: string }[]
  >([]);
  const [selected, setSelected] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [links, setLinks] = useState<HomeworkLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ materials: typeof materials }>(
      `/api/courses/${courseId}/materials`
    ).then(({ materials }) => {
      const hw = materials.filter((m) => m.file_type === "homework");
      setMaterials(hw);
      if (hw[0]) setSelected(hw[0].id);
    });
  }, [courseId]);

  async function run() {
    if (!selected) return;
    setLoading(true);
    setError(null);
    try {
      const { links } = await apiFetch<{ links: HomeworkLink[] }>(
        `/api/courses/${courseId}/homework-link`,
        { method: "POST", body: JSON.stringify({ materialId: selected }) }
      );
      setLinks(links);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Section
      icon={Link2}
      title="Lecture-to-homework linking"
      description="For each homework question, find the most relevant lecture passages."
    >
      {materials.length === 0 ? (
        <p className="text-sm text-slate-500">
          Upload a file as type <b>homework</b> to use this feature.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-brand-500"
          >
            {materials.map((m) => (
              <option key={m.id} value={m.id}>
                {m.file_name}
              </option>
            ))}
          </select>
          <RunButton onClick={run} loading={loading} label="Find links" />
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      {links && (
        <div className="mt-4 space-y-3">
          {links.map((l, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-4">
              <p className="text-sm font-medium text-slate-800 mb-2">
                <FileText className="inline h-4 w-4 mr-1 text-slate-400" />
                {l.question}
                {l.question.length >= 300 ? "…" : ""}
              </p>
              <div className="space-y-1.5 pl-2 border-l-2 border-brand-100">
                {l.relevant.length === 0 && (
                  <p className="text-xs text-slate-400">No strong matches.</p>
                )}
                {l.relevant.map((r, j) => (
                  <div key={j} className="text-xs text-slate-600">
                    <span className="font-medium text-brand-700">
                      {r.materialName}
                    </span>{" "}
                    <span className="text-slate-400">
                      ({Math.round(r.similarity * 100)}%)
                    </span>
                    : {r.excerpt}…
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

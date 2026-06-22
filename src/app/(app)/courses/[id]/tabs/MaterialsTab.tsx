"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/fetcher";
import type { FileType, Material } from "@/lib/types";
import {
  Upload,
  FileText,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  NotebookPen,
} from "lucide-react";
import { cn } from "@/lib/cn";

type MaterialRow = Pick<
  Material,
  | "id"
  | "course_id"
  | "file_name"
  | "file_type"
  | "status"
  | "error"
  | "chunk_count"
  | "uploaded_at"
  | "storage_path"
>;

const isGenerated = (m: MaterialRow) => m.storage_path === null;

function StatusBadge({ m }: { m: MaterialRow }) {
  if (m.status === "done") {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 rounded-full px-2.5 py-1">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Done · {m.chunk_count} chunks
      </span>
    );
  }
  if (m.status === "error") {
    return (
      <span
        title={m.error ?? ""}
        className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 rounded-full px-2.5 py-1"
      >
        <AlertCircle className="h-3.5 w-3.5" />
        Error
      </span>
    );
  }
  const gen = isGenerated(m);
  const labels: Record<string, string> = {
    pending: gen ? "Queued" : "Uploading",
    extracting: gen ? "Researching" : "Extracting text",
    chunking: gen ? "Organizing" : "Chunking",
    embedding: "Embedding",
  };
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 bg-brand-50 rounded-full px-2.5 py-1">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {labels[m.status] ?? "Processing"}…
    </span>
  );
}

export default function MaterialsTab({
  courseId,
  onGoToNotes,
  highlightMaterialId,
  onHighlightDone,
}: {
  courseId: string;
  onGoToNotes?: () => void;
  highlightMaterialId?: string | null;
  onHighlightDone?: () => void;
}) {
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [fileType, setFileType] = useState<FileType>("pdf");
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const load = useCallback(async () => {
    const { materials } = await apiFetch<{ materials: MaterialRow[] }>(
      `/api/courses/${courseId}/materials`
    );
    setMaterials(materials);
  }, [courseId]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll while anything is still processing.
  useEffect(() => {
    const processing = materials.some(
      (m) => m.status !== "done" && m.status !== "error"
    );
    if (!processing) return;
    const t = setInterval(load, 2000);
    return () => clearInterval(t);
  }, [materials, load]);

  useEffect(() => {
    if (!highlightMaterialId) return;
    const el = rowRefs.current.get(highlightMaterialId);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const t = setTimeout(() => onHighlightDone?.(), 3000);
    return () => clearTimeout(t);
  }, [highlightMaterialId, materials, onHighlightDone]);

  const upload = useCallback(
    async (files: FileList | File[]) => {
      setUploadError(null);
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append("file", file);
        fd.append("fileType", fileType);
        try {
          await apiFetch(`/api/courses/${courseId}/materials`, {
            method: "POST",
            body: fd,
          });
        } catch (err) {
          setUploadError(
            err instanceof Error ? err.message : "Upload failed"
          );
        }
      }
      await load();
    },
    [courseId, fileType, load]
  );

  async function remove(id: string) {
    if (!confirm("Delete this material and its chunks?")) return;
    setMaterials((m) => m.filter((x) => x.id !== id));
    await apiFetch(`/api/materials/${id}`, { method: "DELETE" }).catch(() => {});
    load();
  }

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-sm font-medium text-slate-600">
            File type:
          </span>
          {(["pdf", "slides", "notes", "homework"] as FileType[]).map((t) => (
            <button
              key={t}
              onClick={() => setFileType(t)}
              className={cn(
                "rounded-full px-3 py-1 text-sm capitalize border",
                fileType === t
                  ? "border-brand-500 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:bg-slate-100"
              )}
            >
              {t}
            </button>
          ))}
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files.length) upload(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "rounded-2xl border-2 border-dashed p-10 text-center cursor-pointer transition-colors",
            dragging
              ? "border-brand-500 bg-brand-50"
              : "border-slate-300 bg-white hover:border-brand-400"
          )}
        >
          <Upload className="h-8 w-8 mx-auto text-slate-400" />
          <p className="mt-3 font-medium text-slate-700">
            Drag &amp; drop a file, or click to browse
          </p>
          <p className="text-sm text-slate-500 mt-1">
            PDFs and slide exports are parsed automatically. Notes can be .txt
            or .md.
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.txt,.md,.markdown"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files?.length) upload(e.target.files);
              e.target.value = "";
            }}
          />
        </div>
        {uploadError && (
          <p className="mt-2 text-sm text-red-600">{uploadError}</p>
        )}
      </div>

      {/* No-material hint → Notes generator */}
      <div className="rounded-2xl border border-brand-100 bg-gradient-to-br from-brand-50/60 to-transparent p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-brand-700">
            <NotebookPen className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-slate-800">
              Don&apos;t have material for a topic?
            </h3>
            <p className="text-sm text-slate-500 mt-0.5">
              Head to the <b className="text-slate-700">Notes</b> tab, generate
              polished notes for the topic, download them, then upload the file
              here so you can search, quiz, and revise from it.
            </p>
            {onGoToNotes && (
              <button
                onClick={onGoToNotes}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-700 hover:shadow active:scale-[0.98]"
              >
                <NotebookPen className="h-4 w-4" />
                Open the Notes generator
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="font-semibold text-slate-700">
          Library ({materials.length})
        </h2>
        {materials.length === 0 && (
          <p className="text-sm text-slate-500">
            No materials yet. Upload your first file above.
          </p>
        )}
        {materials.map((m) => (
          <div
            key={m.id}
            ref={(el) => {
              if (el) rowRefs.current.set(m.id, el);
              else rowRefs.current.delete(m.id);
            }}
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-xl border bg-white p-3 transition-colors",
              highlightMaterialId === m.id
                ? "border-brand-400 ring-2 ring-brand-100 bg-brand-50/40"
                : "border-slate-200"
            )}
          >
            <div
              className={cn(
                "h-9 w-9 rounded-lg flex items-center justify-center",
                isGenerated(m)
                  ? "bg-brand-50 text-brand-600"
                  : "bg-slate-100 text-slate-500"
              )}
            >
              {isGenerated(m) ? (
                <Sparkles className="h-5 w-5" />
              ) : (
                <FileText className="h-5 w-5" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{m.file_name}</p>
              <p className="text-xs text-slate-400 capitalize">
                {isGenerated(m) ? "AI topic · web-researched" : m.file_type}
              </p>
            </div>
            <StatusBadge m={m} />
            <button
              onClick={() => remove(m.id)}
              className="p-2 rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            {m.status === "error" && m.error && (
              <p className="basis-full text-xs text-red-600 bg-red-50 border border-red-100 rounded-md px-2 py-1.5 mt-1">
                {m.error}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

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
>;

const STEPS: { key: Material["status"]; label: string }[] = [
  { key: "extracting", label: "Extracting text" },
  { key: "chunking", label: "Chunking" },
  { key: "embedding", label: "Embedding" },
  { key: "done", label: "Done" },
];

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
  const stepIndex = STEPS.findIndex((s) => s.key === m.status);
  const label =
    m.status === "pending"
      ? "Uploading"
      : STEPS[stepIndex]?.label ?? "Processing";
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-brand-700 bg-brand-50 rounded-full px-2.5 py-1">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      {label}…
    </span>
  );
}

export default function MaterialsTab({ courseId }: { courseId: string }) {
  const [materials, setMaterials] = useState<MaterialRow[]>([]);
  const [fileType, setFileType] = useState<FileType>("pdf");
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
            className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3"
          >
            <div className="h-9 w-9 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500">
              <FileText className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{m.file_name}</p>
              <p className="text-xs text-slate-400 capitalize">{m.file_type}</p>
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

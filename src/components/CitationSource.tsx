"use client";

import { FileText, ExternalLink } from "lucide-react";

export interface CitationSourceProps {
  materialId: string;
  materialName: string;
  excerpt: string;
  page?: number;
  chunkIndex?: number;
  onOpenMaterial?: (materialId: string) => void;
}

export function CitationSource({
  materialId,
  materialName,
  excerpt,
  page,
  chunkIndex,
  onOpenMaterial,
}: CitationSourceProps) {
  const location =
    page != null
      ? `p.${page}`
      : chunkIndex != null
        ? `section ${chunkIndex + 1}`
        : null;

  return (
    <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-600">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="flex items-center gap-1.5 font-medium text-slate-700 min-w-0">
          <FileText className="h-3.5 w-3.5 shrink-0 text-brand-600" />
          <span className="truncate">
            {materialName}
            {location ? ` · ${location}` : ""}
          </span>
        </p>
        {onOpenMaterial && (
          <button
            type="button"
            onClick={() => onOpenMaterial(materialId)}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-brand-700 hover:bg-brand-50"
          >
            <ExternalLink className="h-3 w-3" />
            Open in Materials
          </button>
        )}
      </div>
      <p className="whitespace-pre-wrap leading-relaxed">{excerpt}</p>
    </div>
  );
}

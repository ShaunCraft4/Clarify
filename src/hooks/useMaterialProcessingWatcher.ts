"use client";

import { useEffect, useRef } from "react";
import { apiFetch } from "@/lib/fetcher";
import { useToast } from "@/components/Toast";

type MaterialStatus = {
  id: string;
  file_name: string;
  status: string;
};

export function useMaterialProcessingWatcher(
  courseId: string,
  onProcessingChange: (count: number) => void
) {
  const toast = useToast();
  const prevStatusRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const { materials } = await apiFetch<{ materials: MaterialStatus[] }>(
          `/api/courses/${courseId}/materials`
        );
        if (cancelled) return;

        const processingCount = materials.filter(
          (m) => m.status !== "done" && m.status !== "error"
        ).length;
        onProcessingChange(processingCount);
        window.dispatchEvent(
          new CustomEvent("clarify:material-processing", {
            detail: { courseId, processingCount },
          })
        );

        for (const m of materials) {
          const prev = prevStatusRef.current.get(m.id);
          if (prev && prev !== "done" && m.status === "done") {
            toast(`${m.file_name} finished processing`);
          }
          prevStatusRef.current.set(m.id, m.status);
        }
      } catch {
        /* ignore transient errors */
      }
    }

    tick();
    const interval = setInterval(tick, 3000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [courseId, onProcessingChange, toast]);
}

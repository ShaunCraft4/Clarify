"use client";

import { useEffect, useRef } from "react";
import { useToast } from "@/components/Toast";
import type { MaterialRow } from "@/hooks/useCourseMaterials";

/** Toast + sidebar event when a material finishes embedding. */
export function useMaterialProcessingToasts(
  courseId: string,
  materials: MaterialRow[],
  processingCount: number
) {
  const toast = useToast();
  const prevStatusRef = useRef<Map<string, string>>(new Map());

  useEffect(() => {
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
  }, [materials, courseId, processingCount, toast]);
}

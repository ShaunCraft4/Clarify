"use client";

import useSWR from "swr";
import { courseCacheKeys } from "@/lib/course-fetchers";
import {
  fetchCourseMaterials,
  type MaterialRow,
} from "@/lib/course-fetchers";

export type { MaterialRow };

function isProcessing(m: MaterialRow): boolean {
  return m.status !== "done" && m.status !== "error";
}

export function useCourseMaterials(courseId: string) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    courseCacheKeys.materials(courseId),
    () => fetchCourseMaterials(courseId),
    {
      refreshInterval: (latest) =>
        (latest ?? []).some(isProcessing) ? 2000 : 0,
    }
  );

  const materials = Array.isArray(data) ? data : [];

  return {
    materials,
    processingCount: materials.filter(isProcessing).length,
    isLoading: isLoading && !data,
    isValidating,
    error: error instanceof Error ? error.message : null,
    refresh: () => mutate(),
  };
}

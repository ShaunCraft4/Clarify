"use client";

import useSWR from "swr";
import {
  fetchCourseProgressBundle,
  progressCacheKey,
  type ExamReadiness,
  type ProgressData,
} from "@/lib/course-fetchers";

export type { ExamReadiness, ProgressData };

export function useCourseProgress(courseId: string) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    progressCacheKey(courseId),
    () => fetchCourseProgressBundle(courseId)
  );

  return {
    progress: data?.progress ?? null,
    readiness: data?.readiness ?? null,
    isLoading: isLoading && !data,
    isValidating,
    error: error instanceof Error ? error.message : null,
    refresh: () => mutate(),
  };
}

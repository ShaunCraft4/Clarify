"use client";

import useSWR from "swr";
import {
  courseCacheKeys,
  fetchCourseFlashcards,
  type FlashcardsCache,
} from "@/lib/course-fetchers";

export function useCourseFlashcards(courseId: string) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    courseCacheKeys.flashcards(courseId),
    () => fetchCourseFlashcards(courseId)
  );

  const cache: FlashcardsCache = data ?? { flashcards: [], dueCount: 0 };

  return {
    flashcards: cache.flashcards,
    dueCount: cache.dueCount,
    isLoading: isLoading && !data,
    isValidating,
    error: error instanceof Error ? error.message : null,
    refresh: () => mutate(),
    patch: (updater: (prev: FlashcardsCache) => FlashcardsCache) =>
      mutate(
        (prev) => updater(prev ?? { flashcards: [], dueCount: 0 }),
        { revalidate: false }
      ),
  };
}

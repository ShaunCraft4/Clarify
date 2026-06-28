"use client";

import useSWR from "swr";
import {
  courseCacheKeys,
  fetchCourseFlashcards,
  type FlashcardsCache,
} from "@/lib/course-fetchers";
import { countDueFlashcards } from "@/lib/srs";

export function useCourseFlashcards(courseId: string) {
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    courseCacheKeys.flashcards(courseId),
    () => fetchCourseFlashcards(courseId)
  );

  const cache: FlashcardsCache = data ?? { flashcards: [], dueCount: 0 };
  const flashcards = cache.flashcards;
  const dueCount = countDueFlashcards(flashcards);

  return {
    flashcards,
    dueCount,
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

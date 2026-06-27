"use client";

import useSWR from "swr";
import {
  fetchCourseQuizzesBundle,
  quizzesCacheKey,
  type QuizSummary,
  type RubricInfo,
} from "@/lib/course-fetchers";

export type { QuizSummary, RubricInfo };

export function useCourseQuizzes(courseId: string) {
  const key = quizzesCacheKey(courseId);
  const { data, error, isLoading, isValidating, mutate } = useSWR(
    key,
    () => fetchCourseQuizzesBundle(courseId)
  );

  return {
    quizzes: data?.quizzes ?? [],
    rubric: data?.rubric ?? null,
    isLoading: isLoading && !data,
    isValidating,
    error: error instanceof Error ? error.message : null,
    refresh: () => mutate(),
    setRubric: (rubric: RubricInfo | null) =>
      mutate(
        (prev) => (prev ? { ...prev, rubric } : { quizzes: [], rubric }),
        { revalidate: false }
      ),
  };
}

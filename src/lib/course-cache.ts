import { mutate } from "swr";
import {
  courseCacheKeys,
  fetchCourseFlashcards,
  fetchCourseMaterials,
  fetchCourseProgressBundle,
  fetchCourseQuizzesBundle,
  progressCacheKey,
  quizzesCacheKey,
} from "@/lib/course-fetchers";

export { courseCacheKeys } from "@/lib/course-fetchers";

export type TabPrefetchId =
  | "materials"
  | "flashcards"
  | "quizzes"
  | "ask"
  | "search"
  | "notes"
  | "progress"
  | "plan"
  | "insights";

/** Warm the in-memory cache for the tabs users open most often. */
export function prefetchCourseTabs(courseId: string) {
  void mutate(
    courseCacheKeys.materials(courseId),
    () => fetchCourseMaterials(courseId)
  );
  void mutate(
    courseCacheKeys.flashcards(courseId),
    () => fetchCourseFlashcards(courseId)
  );
  void mutate(quizzesCacheKey(courseId), () =>
    fetchCourseQuizzesBundle(courseId)
  );
  void mutate(progressCacheKey(courseId), () =>
    fetchCourseProgressBundle(courseId)
  );
}

/** Prefetch a single tab's data on hover (no-op for non-API tabs). */
export function prefetchCourseTab(courseId: string, tab: TabPrefetchId) {
  if (tab === "materials") {
    void mutate(
      courseCacheKeys.materials(courseId),
      () => fetchCourseMaterials(courseId)
    );
  } else if (tab === "flashcards") {
    void mutate(
      courseCacheKeys.flashcards(courseId),
      () => fetchCourseFlashcards(courseId)
    );
  } else if (tab === "quizzes") {
    void mutate(quizzesCacheKey(courseId), () =>
      fetchCourseQuizzesBundle(courseId)
    );
  } else if (tab === "progress") {
    void mutate(progressCacheKey(courseId), () =>
      fetchCourseProgressBundle(courseId)
    );
  }
}

/** Invalidate cached course data after mutations. */
export function invalidateCourseCache(
  courseId: string,
  ...keys: Array<"materials" | "flashcards" | "quizzes" | "rubric" | "progress">
) {
  const all = keys.length === 0;
  if (all || keys.includes("materials")) {
    void mutate(courseCacheKeys.materials(courseId));
  }
  if (all || keys.includes("flashcards")) {
    void mutate(courseCacheKeys.flashcards(courseId));
  }
  if (all || keys.includes("quizzes") || keys.includes("rubric")) {
    void mutate(quizzesCacheKey(courseId));
  }
  if (all || keys.includes("progress")) {
    void mutate(progressCacheKey(courseId));
  }
}

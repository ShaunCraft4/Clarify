import { apiFetch } from "@/lib/fetcher";
import type { Flashcard, Material } from "@/lib/types";

/** Stable SWR cache keys for per-course resources. */
export const courseCacheKeys = {
  materials: (courseId: string) =>
    `/api/courses/${courseId}/materials` as const,
  flashcards: (courseId: string) =>
    `/api/courses/${courseId}/flashcards` as const,
  quizzes: (courseId: string) => `/api/courses/${courseId}/quizzes` as const,
  rubric: (courseId: string) => `/api/courses/${courseId}/rubric` as const,
  progress: (courseId: string) => `/api/courses/${courseId}/progress` as const,
  examReadiness: (courseId: string) =>
    `/api/courses/${courseId}/exam-readiness` as const,
};

export type MaterialRow = Pick<
  Material,
  | "id"
  | "course_id"
  | "file_name"
  | "file_type"
  | "status"
  | "error"
  | "chunk_count"
  | "uploaded_at"
  | "storage_path"
>;

export interface FlashcardsCache {
  flashcards: Flashcard[];
  dueCount: number;
}

export interface QuizSummary {
  id: string;
  title: string;
  created_at: string;
  questionCount: number;
  bestScore: number | null;
  is_exam_sim?: boolean;
  time_limit_minutes?: number | null;
}

export interface RubricInfo {
  id: string;
  file_name: string;
  uploaded_at: string;
}

export interface QuizzesCache {
  quizzes: QuizSummary[];
  rubric: RubricInfo | null;
}

export interface MasteryRow {
  topic: string;
  mastery_score: number;
  attempts_count: number;
}

export interface AttemptRow {
  score: number;
  completed_at: string;
}

export interface ProgressData {
  mastery: MasteryRow[];
  attempts: AttemptRow[];
  stats: {
    quizzesCompleted: number;
    flashcardsTotal: number;
    flashcardsMastered: number;
    topicsTracked: number;
  };
}

export interface ExamReadiness {
  score: number;
  breakdown: {
    mastery: number;
    quizTrend: number;
    flashcards: number;
    coverage: number;
  };
  weakTopics: string[];
  summary: string;
}

export interface ProgressCache {
  progress: ProgressData;
  readiness: ExamReadiness;
}

export function quizzesCacheKey(courseId: string): string {
  return `${courseCacheKeys.quizzes(courseId)}+rubric`;
}

export function progressCacheKey(courseId: string): string {
  return `${courseCacheKeys.progress(courseId)}+readiness`;
}

export async function fetchCourseMaterials(
  courseId: string
): Promise<MaterialRow[]> {
  const { materials } = await apiFetch<{ materials: MaterialRow[] }>(
    courseCacheKeys.materials(courseId)
  );
  return materials;
}

export async function fetchCourseFlashcards(
  courseId: string
): Promise<FlashcardsCache> {
  return apiFetch<FlashcardsCache>(courseCacheKeys.flashcards(courseId));
}

export async function fetchCourseQuizzesBundle(
  courseId: string
): Promise<QuizzesCache> {
  const [quizzesRes, rubricRes] = await Promise.all([
    apiFetch<{ quizzes: QuizSummary[] }>(courseCacheKeys.quizzes(courseId)),
    apiFetch<{ rubric: RubricInfo | null }>(courseCacheKeys.rubric(courseId)),
  ]);
  return { quizzes: quizzesRes.quizzes, rubric: rubricRes.rubric };
}

export async function fetchCourseProgressBundle(
  courseId: string
): Promise<ProgressCache> {
  const [progress, readiness] = await Promise.all([
    apiFetch<ProgressData>(courseCacheKeys.progress(courseId)),
    apiFetch<ExamReadiness>(courseCacheKeys.examReadiness(courseId)),
  ]);
  return { progress, readiness };
}

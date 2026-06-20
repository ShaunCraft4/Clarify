export type FileType = "pdf" | "slides" | "notes" | "homework";

export type MaterialStatus =
  | "pending"
  | "extracting"
  | "chunking"
  | "embedding"
  | "done"
  | "error";

export interface Course {
  id: string;
  user_id: string;
  name: string;
  description: string | null;
  created_at: string;
}

export interface Material {
  id: string;
  course_id: string;
  user_id: string;
  file_name: string;
  file_type: FileType;
  storage_path: string | null;
  extracted_text: string;
  chunk_count: number;
  status: MaterialStatus;
  error: string | null;
  uploaded_at: string;
}

export interface ChunkMatch {
  id: string;
  material_id: string;
  content: string;
  chunk_index: number;
  metadata: { page?: number; section?: string };
  similarity: number;
}

export interface Flashcard {
  id: string;
  course_id: string;
  user_id: string;
  question: string;
  answer: string;
  topic: string | null;
  source_chunk_id: string | null;
  mastered_at: string | null;
  review_count: number;
  last_reviewed_at: string | null;
  ease_factor: number;
  interval_days: number;
  due_at: string;
  created_at: string;
  source_material?: string | null;
  source_excerpt?: string | null;
}

export type QuestionType = "multiple_choice" | "short_answer" | "true_false";

export interface QuizQuestion {
  id: string;
  quiz_id: string;
  type: QuestionType;
  question: string;
  options: string[] | null;
  correct_answer: string;
  topic: string;
  source_chunk_id: string | null;
  position: number;
}

/** A quiz question as sent to the client while taking a quiz (no answer). */
export type QuizQuestionPublic = Omit<QuizQuestion, "correct_answer">;

export interface Quiz {
  id: string;
  course_id: string;
  title: string;
  created_at: string;
  is_exam_sim?: boolean;
  time_limit_minutes?: number | null;
  questions?: QuizQuestion[];
}

export interface QuizAttemptAnswer {
  questionId: string;
  answer: string;
  correct: boolean;
}

export interface TopicBreakdown {
  topic: string;
  correct: number;
  total: number;
}

export interface QuizAttempt {
  id: string;
  quiz_id: string;
  course_id: string;
  user_id: string;
  answers: QuizAttemptAnswer[];
  score: number;
  topic_breakdown: TopicBreakdown[];
  completed_at: string;
}

export interface TopicMastery {
  id: string;
  user_id: string;
  course_id: string;
  topic: string;
  mastery_score: number;
  attempts_count: number;
  last_updated_at: string;
}

export interface Citation {
  materialId: string;
  materialName: string;
  page?: number;
  chunkId: string;
  excerpt: string;
}

export interface StudyPlanDay {
  day: number;
  date: string;
  topics: string[];
  tasks: string[];
}

export interface GapRecommendation {
  topic: string;
  masteryScore: number;
  prerequisites: string[];
}

export interface ExamPrediction {
  topic: string;
  confidence: number;
  rationale: string;
}

export interface ConceptNode {
  id: string;
  label: string;
}

export interface ConceptEdge {
  from: string;
  to: string;
}

export interface DependencyGraph {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

import { generateJSON } from "@/lib/ai/gemini";
import { isCorrect } from "@/lib/mastery";

interface GradeResult {
  correct: boolean;
  feedback?: string;
}

/** Grade a short answer using the course rubric when available. */
export async function gradeShortAnswer(
  question: string,
  userAnswer: string,
  referenceAnswer: string,
  rubricText?: string | null
): Promise<GradeResult> {
  if (!userAnswer.trim()) return { correct: false };

  if (!rubricText?.trim()) {
    return {
      correct: isCorrect("short_answer", userAnswer, referenceAnswer),
    };
  }

  try {
    const result = await generateJSON<{ correct: boolean; feedback: string }>(
      `Grade this short-answer response using the rubric and reference answer.

QUESTION: ${question}

REFERENCE ANSWER: ${referenceAnswer}

STUDENT ANSWER: ${userAnswer}

RUBRIC:
${rubricText.slice(0, 5000)}

Return JSON: { "correct": boolean, "feedback": "one sentence why" }
Mark correct if the student meets the rubric criteria, even if wording differs from the reference.`,
      'Respond with JSON only: {"correct": boolean, "feedback": string}.'
    );
    return {
      correct: Boolean(result.correct),
      feedback: result.feedback,
    };
  } catch {
    return {
      correct: isCorrect("short_answer", userAnswer, referenceAnswer),
    };
  }
}

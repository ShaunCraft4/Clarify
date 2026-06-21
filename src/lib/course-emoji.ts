import type { SupabaseClient } from "@supabase/supabase-js";
import { generateText } from "@/lib/ai/gemini";
import { isMissingColumn } from "@/lib/db-schema";

const FALLBACK_EMOJIS = [
  "📚",
  "🎓",
  "📖",
  "✏️",
  "🧠",
  "💡",
  "🔬",
  "📐",
  "💻",
  "🌍",
  "🧪",
  "📊",
];

function hashString(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function fallbackEmoji(courseName: string): string {
  return FALLBACK_EMOJIS[hashString(courseName) % FALLBACK_EMOJIS.length];
}

function parseEmoji(text: string): string | null {
  const match = text.match(/\p{Extended_Pictographic}/u);
  return match?.[0] ?? null;
}

/** Pick one emoji for a course name via Gemini, with a deterministic fallback. */
export async function generateCourseEmoji(courseName: string): Promise<string> {
  try {
    const text = await generateText(
      `Course name: "${courseName}"\n\nReply with exactly ONE emoji that best represents this academic course. Output only the emoji — no words.`,
      "You choose a single fitting emoji for university course names. Reply with one emoji character only."
    );
    return parseEmoji(text) ?? fallbackEmoji(courseName);
  } catch {
    return fallbackEmoji(courseName);
  }
}

/** Persist emoji on the course row when the column exists. */
export async function assignCourseEmoji(
  supabase: SupabaseClient,
  courseId: string,
  courseName: string
): Promise<string> {
  const emoji = await generateCourseEmoji(courseName);
  const { error } = await supabase
    .from("courses")
    .update({ emoji })
    .eq("id", courseId);
  if (error && !isMissingColumn(error)) throw error;
  return emoji;
}

/** Stable accent color for a course row dot. */
export function courseAccentColor(courseId: string): string {
  const palette = [
    "#3375ff",
    "#10b981",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
    "#06b6d4",
    "#ef4444",
    "#84cc16",
  ];
  return palette[hashString(courseId) % palette.length];
}

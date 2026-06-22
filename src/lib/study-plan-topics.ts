import { generateJSON } from "@/lib/ai/gemini";

/** Split optional user input into topic phrases. */
export function parseExamTopicsInput(input: string): string[] {
  return input
    .split(/[\n,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeTopic(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Loose match so "red black trees" matches "Red-Black Trees". */
export function topicMatches(a: string, b: string): boolean {
  const na = normalizeTopic(a);
  const nb = normalizeTopic(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.includes(nb) || nb.includes(na)) return true;

  const wa = new Set(na.split(/\s+/).filter((w) => w.length > 2));
  const wb = new Set(nb.split(/\s+/).filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return false;

  let overlap = 0;
  for (const w of wa) if (wb.has(w)) overlap++;
  const minSize = Math.min(wa.size, wb.size);
  return overlap >= Math.max(1, Math.ceil(minSize * 0.5));
}

/**
 * Derive the topic list the plan may cover.
 * Empty user input → all material topics.
 */
export function resolveStudyScope(
  materialTopics: string[],
  userTopics: string[]
): string[] {
  if (userTopics.length === 0) return materialTopics;
  if (materialTopics.length === 0) return userTopics;

  const matched = materialTopics.filter((mt) =>
    userTopics.some((ut) => topicMatches(mt, ut))
  );
  return matched.length > 0 ? matched : userTopics;
}

/** Ask the model which topics are actually present in uploaded content. */
export async function extractTopicsFromMaterials(
  content: string,
  courseName: string
): Promise<string[]> {
  const prompt = `Course: "${courseName}"

Read ONLY the excerpts below. List every distinct topic or concept that is explicitly covered in the text.

Rules:
- Include only topics that appear in these excerpts.
- Do NOT invent topics from a typical syllabus (e.g. do not add linked lists, C++, AVL, hash tables unless they are in the text).
- Use short, specific labels (e.g. "B-Trees", "Red-Black Trees", "Splay Trees").

Return JSON: { "topics": ["..."] }

MATERIAL EXCERPTS:
${content}`;

  const result = await generateJSON<{ topics: string[] }>(
    prompt,
    'Respond with valid JSON only: { "topics": string[] }. No markdown.'
  );

  const topics = (Array.isArray(result?.topics) ? result.topics : [])
    .map((t) => String(t).trim())
    .filter(Boolean);

  return [...new Set(topics)];
}

export interface TopicScore {
  topic: string;
  score: number;
}

/** Keep mastery rows whose topic falls within the study scope. */
export function filterMasteryToScope(
  mastery: TopicScore[],
  scopeTopics: string[]
): TopicScore[] {
  if (scopeTopics.length === 0) return mastery;
  return mastery.filter((m) =>
    scopeTopics.some((s) => topicMatches(m.topic, s))
  );
}

/** Natural-language study queries — strip command words to find the topic. */
const COMMAND_PREFIX =
  /^(please\s+)?(can you\s+)?(explain|summarize|summarise|describe|tell me about|what is|what are|give me|write about|overview of|review|go over|help me (understand|with))\s+/i;

const MATERIALS_SUFFIX =
  /\s+(from|in|about|across)\s+(all|my|the)?\s*(materials?|course|notes?|slides?|readings?|uploads?|files?)\s*$/i;

const STOP_WORDS = new Set([
  "the",
  "and",
  "for",
  "with",
  "from",
  "that",
  "this",
  "about",
  "into",
  "your",
  "have",
  "has",
  "are",
  "was",
  "were",
  "will",
  "would",
  "could",
  "should",
  "please",
  "explain",
  "summarize",
  "summarise",
  "describe",
  "everything",
  "anything",
  "something",
  "materials",
  "material",
  "course",
  "notes",
  "tell",
  "give",
  "write",
  "what",
  "when",
  "where",
  "which",
  "how",
  "why",
  "all",
  "my",
  "entire",
  "whole",
  "full",
  "just",
  "also",
  "very",
  "really",
]);

/** Full-course / all-materials overview queries. */
export function isBroadOverviewQuery(query: string): boolean {
  const q = query.toLowerCase().trim();

  // "everything about [specific topic]" → topic search, not full-course recap.
  if (/\b(everything|all)\s+about\s+\S+/i.test(q)) {
    const topic = extractTopic(query);
    if (topic.length >= 3) return false;
  }

  return (
    /\b(everything|all materials?|all my materials?|entire course|whole course|full course|all topics?|all content)\b/.test(
      q
    ) ||
    /\b(summarize|summarise|summary|overview|explain|describe|review|recap)\s+(all|everything|entire|whole|my|the)\s*(materials?|course|content)?\s*$/i.test(
      q
    ) ||
    /\bwhat\s+(is|are)\s+(covered|in)\s+(all|everything|my|the)\b/.test(q) ||
    /\bexplain\s+(all|everything)\s*(from|in|across)?\s*(all|my|the)?\s*(materials?|course|content)?\s*$/i.test(
      q
    ) ||
    /^summarize\b/i.test(query) ||
    /^overview\b/i.test(query) ||
    /^recap\b/i.test(query)
  );
}

/** Pull the subject out of a conversational query. */
export function extractTopic(query: string): string {
  let topic = query.trim();
  topic = topic.replace(COMMAND_PREFIX, "");
  topic = topic.replace(/\beverything\s+about\b/gi, "");
  topic = topic.replace(/\ball\s+about\b/gi, "");
  topic = topic.replace(MATERIALS_SUFFIX, "");
  topic = topic.replace(/\b(from|in|about)\s+(all|my|the)?\s*(materials?|course)\b/gi, "");
  return topic.replace(/\s+/g, " ").trim();
}

/** Meaningful words for loose keyword fallback (not used on semantic hits). */
export function topicKeywords(query: string): string[] {
  const topic = extractTopic(query) || query;
  const words = topic
    .toLowerCase()
    .split(/[\s,]+/)
    .map((w) => w.replace(/[^\w-]/g, ""))
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

export function keywordScore(content: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const lower = content.toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (lower.includes(kw)) score++;
  }
  return score;
}

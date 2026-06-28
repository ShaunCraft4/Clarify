/** Natural-language study queries — strip command words to find the topic. */

const MATERIALS_SUFFIX =
  /\s+(?:from|in|about|across|using|based on)\s+(?:all|my|the|our)?\s*(?:uploaded\s+)?(?:materials?|course|notes?|slides?|readings?|uploads?|files?|library|textbook|lectures?|handouts?|pdfs?)\s*$/i;

function normalizeSpaces(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Fix common typos before pattern stripping. */
function normalizeQueryTypos(text: string): string {
  return text
    .replace(/\bexplain(?:t|d)\s+o\s+me\b/gi, "explain to me")
    .replace(/\bexplain(?:t|d)\s+to\s+me\b/gi, "explain to me")
    .replace(/\bexplain(?:t|d)\b/gi, "explain")
    .replace(/\s+o\s+me\b/gi, " to me")
    .replace(/\bt\s+o\s+me\b/gi, "to me");
}

/** Applied repeatedly until the string stops changing. */
const LEADING_STRIPS: RegExp[] = [
  /^(?:please|kindly|hey|hi|hello|yo|ok|okay)\s*,?\s*/i,
  /^(?:thanks|thank you)\s*,?\s*(?:but\s+)?/i,
  /^(?:search(?:\s+for)?|find(?:\s+(?:info(?:rmation)?|notes?))?(?:\s+(?:on|about|for))?|look(?:\s+up)?|lookup)\s+/i,
  /^(?:study\s+)?notes?(?:\s+(?:on|about|for|regarding))?\s+/i,
  /^(?:info(?:rmation)?|details?|everything)\s+(?:on|about|for|regarding)\s+/i,
  /^(?:i(?:'m|\s+am)\s+(?:confused|stuck|lost)\s+(?:on|about|with)|i\s+don'?t\s+(?:understand|get)\s+(?:the\s+)?)\s*/i,
  /^(?:i(?:'m|\s+was)\s+wondering\s+(?:if\s+(?:you\s+)?(?:could|can|would)\s+(?:explain|tell me about|describe|clarify)\s+|about\s+|whether\s+))\s*/i,
  /^(?:i(?:'d|\s+would|\s+want|\s+need|\s+wanna)\s+(?:like\s+)?(?:you\s+to\s+)?(?:know|learn|understand)\s+(?:about\s+)?)\s*/i,
  /^(?:can you|could you|would you|will you|do you mind(?: if you)?)\s+(?:please\s+)?/i,
  /^(?:can i get|could i get)\s+(?:an?\s+)?(?:explanation|overview|summary|rundown|breakdown)\s+(?:of|on|about)\s+/i,
  /^(?:help me\s+(?:understand|with|learn(?:\s+about)?)|walk me through|break down|clarify|define|explain(?:t|s|ed)?|describe|summarize|summarise|outline|review|recap|go over|cover|discuss|talk about|teach me|show me|compare|contrast)\s+/i,
  /^(?:give me\s+(?:an?\s+)?(?:overview|summary|explanation|rundown|breakdown)\s+(?:of|on|about)\s+)/i,
  /^(?:tell me\s+(?:about\s+)?)\s*/i,
  /^(?:write\s+(?:about|on|notes?\s+(?:on|about|for)))\s+/i,
  /^(?:what(?:'s|\s+is|\s+are)\s+(?:the\s+)?(?:definition of|meaning of|difference between|purpose of|role of|concept of|idea of|time complexity of|space complexity of|big[- ]o of|properties of|characteristics of|features of|advantages of|disadvantages of|types of|steps of|overview of)\s+)/i,
  /^(?:what(?:'s|\s+is|\s+are)\s+(?:a|an|the)\s+)/i,
  /^(?:what(?:'s|\s+is|\s+are)\s+)/i,
  /^(?:why(?:'s|\s+do|\s+does|\s+is|\s+are|\s+would|\s+should|\s+can))\s+(?:we|you|they|it|I|there)\s+(?:use|need|have|call|say)\s+/i,
  /^(?:how(?:'s|\s+do|\s+does|\s+is|\s+are|\s+can|\s+should|\s+would|\s+to))\s+/i,
  /^how\s+/i,
  /^(?:to me|for me|about|regarding|on the topic of|related to|concerning|when it comes to)\s+/i,
  /^(?:a|an|the)\s+/i,
];

const INLINE_STRIPS: RegExp[] = [
  /\beverything\s+about\b/gi,
  /\ball\s+about\b/gi,
  /\b(?:to|t\s+o)\s+me\b/gi,
  /\b(?:from|in|using|based on)\s+(?:all|my|the|our)?\s*(?:uploaded\s+)?(?:materials?|course|notes?|slides?|readings?|uploads?|files?|library)\b/gi,
];

const TRAILING_STRIPS: RegExp[] = [
  /\s+(?:please|thanks|thank you)\s*$/i,
  /\s+(?:in simple terms|in detail|briefly|quickly|simply|in general|in practice|in theory)\s*$/i,
  /\s+(?:for me|to me)\s*$/i,
  MATERIALS_SUFFIX,
  /\s+(?:work|works|mean|means|function|functions|operate|operates|defined|used|important)\s*\??\s*$/i,
  /\?+$/,
  /[.!]+$/,
];

/** Strip conversational phrasing until only the study topic remains. */
function stripQueryFiller(query: string): string {
  let topic = normalizeSpaces(normalizeQueryTypos(query));

  for (let pass = 0; pass < 16; pass++) {
    const before = topic;
    for (const pattern of LEADING_STRIPS) {
      topic = topic.replace(pattern, " ");
    }
    for (const pattern of INLINE_STRIPS) {
      topic = topic.replace(pattern, " ");
    }
    for (const pattern of TRAILING_STRIPS) {
      topic = topic.replace(pattern, " ");
    }
    topic = normalizeSpaces(topic);
    if (topic === before) break;
  }

  return topic;
}

/** Pull the subject out of a conversational query. */
export function extractTopic(query: string): string {
  return stripQueryFiller(query.trim());
}

export interface ResolvedStudyQuery {
  raw: string;
  /** Clean topic label for messages and prompts. */
  topic: string;
  /** Text to use for embedding / vector search. */
  searchText: string;
  isBroad: boolean;
}

/** Single entry point for Ask, Search, and Notes retrieval. */
export function resolveStudyQuery(raw: string): ResolvedStudyQuery {
  const trimmed = raw.trim();
  const isBroad = isBroadOverviewQuery(trimmed);
  const topic = extractTopic(trimmed);
  const searchText =
    isBroad || topic.length < 2 ? trimmed : topic;
  return {
    raw: trimmed,
    topic: topic.length > 0 ? topic : trimmed,
    searchText,
    isBroad,
  };
}
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

/** Words shared by many course topics — weak alone (e.g. "trees" matches B-trees too). */
const GENERIC_TOPIC_WORDS = new Set([
  "tree",
  "trees",
  "node",
  "nodes",
  "graph",
  "graphs",
  "data",
  "structure",
  "structures",
  "algorithm",
  "algorithms",
  "search",
  "insert",
  "delete",
  "remove",
  "balance",
  "balancing",
  "key",
  "keys",
  "value",
  "values",
  "list",
  "lists",
  "array",
  "arrays",
  "sort",
  "sorting",
  "time",
  "space",
  "complexity",
  "operation",
  "operations",
  "analysis",
  "implementation",
  "properties",
  "property",
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


function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(haystack: string, term: string): boolean {
  const t = term.toLowerCase();
  const h = haystack.toLowerCase();
  if (t.includes("-") || t.includes(" ")) return h.includes(t);
  if (t.length <= 4) {
    return new RegExp(`\\b${escapeRegex(t)}\\b`, "i").test(haystack);
  }
  return h.includes(t);
}

/** Phrase variants for multi-word topics (e.g. "splay trees", "red-black tree"). */
export function topicPhrases(topic: string): string[] {
  const normalized = topic.toLowerCase().trim().replace(/\s+/g, " ");
  if (!normalized) return [];

  const phrases = new Set<string>([normalized]);

  if (normalized.endsWith(" trees")) {
    phrases.add(normalized.replace(/ trees$/, " tree"));
  } else if (normalized.endsWith(" tree")) {
    phrases.add(normalized.replace(/ tree$/, " trees"));
  }

  const hyphenated = normalized.replace(/\s+/g, "-");
  phrases.add(hyphenated);
  if (hyphenated.endsWith("-trees")) {
    phrases.add(hyphenated.replace(/-trees$/, "-tree"));
  } else if (hyphenated.endsWith("-tree")) {
    phrases.add(hyphenated.replace(/-tree$/, "-trees"));
  }

  if (normalized.includes("-")) {
    phrases.add(normalized.replace(/-/g, " "));
  }

  return [...phrases].filter((p) => p.length >= 3);
}

/** Meaningful words for keyword matching. */
export function topicKeywords(query: string): string[] {
  const topic = extractTopic(query) || query;
  const words = topic
    .toLowerCase()
    .split(/[\s,]+/)
    .map((w) => w.replace(/[^\w-]/g, ""))
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

/** Drop generic words when the topic has a specific anchor (e.g. "splay", not "trees"). */
export function distinctiveKeywords(query: string): string[] {
  const all = topicKeywords(query);
  const distinctive = all.filter((w) => !GENERIC_TOPIC_WORDS.has(w));
  return distinctive.length > 0 ? distinctive : all;
}

export function keywordScore(content: string, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  let score = 0;
  for (const kw of keywords) {
    if (containsTerm(content, kw)) score++;
  }
  return score;
}

export interface TopicScorableChunk {
  content: string;
  materialName: string;
  similarity: number;
}

/** Score how well a chunk matches the requested topic (not just "trees" in general). */
export function scoreChunkForTopic(
  content: string,
  materialName: string,
  topic: string,
  keywords: string[] = topicKeywords(topic)
): number {
  const distinctive = keywords.filter((w) => !GENERIC_TOPIC_WORDS.has(w));
  const generic = keywords.filter((w) => GENERIC_TOPIC_WORDS.has(w));
  let score = 0;

  for (const phrase of topicPhrases(topic)) {
    if (containsTerm(content, phrase) || containsTerm(materialName, phrase)) {
      score += 12;
    }
  }

  for (const kw of distinctive) {
    if (containsTerm(content, kw) || containsTerm(materialName, kw)) {
      score += 5;
    }
  }

  const hasDistinctiveSignal =
    score >= 5 ||
    distinctive.some(
      (kw) => containsTerm(content, kw) || containsTerm(materialName, kw)
    );

  if (hasDistinctiveSignal) {
    for (const kw of generic) {
      if (containsTerm(content, kw)) score += 1;
    }
  }

  return score;
}

/** Count phrase occurrences across text (case-insensitive). */
function countPhraseOccurrences(text: string, topic: string): number {
  let total = 0;
  for (const phrase of topicPhrases(topic)) {
    const re = new RegExp(escapeRegex(phrase), "gi");
    total += text.match(re)?.length ?? 0;
  }
  return total;
}

/**
 * True when retrieved chunks substantively cover the topic — not a one-line comparison
 * (e.g. "like AVL trees" inside a splay-tree handout).
 */
export function hasSubstantiveTopicCoverage(
  chunks: TopicScorableChunk[],
  query: string
): boolean {
  const topic = extractTopic(query) || query;
  const keywords = topicKeywords(query);
  const distinctive = distinctiveKeywords(query);

  const scored = chunks
    .map((chunk) => ({
      chunk,
      topicScore: scoreChunkForTopic(
        chunk.content,
        chunk.materialName,
        topic,
        keywords
      ),
    }))
    .filter((s) => s.topicScore >= 5)
    .sort((a, b) => b.topicScore - a.topicScore);

  if (scored.length === 0) return false;

  if (
    scored.some((s) =>
      topicPhrases(topic).some((p) => containsTerm(s.chunk.materialName, p))
    )
  ) {
    return true;
  }

  const haystack = scored.map((s) => s.chunk.content).join("\n");
  const phraseOccurrences = countPhraseOccurrences(haystack, topic);
  const distinctHits = distinctive.filter((kw) =>
    scored.some(
      (s) =>
        containsTerm(s.chunk.content, kw) ||
        containsTerm(s.chunk.materialName, kw)
    )
  ).length;

  const topScore = scored[0].topicScore;
  const secondScore = scored[1]?.topicScore ?? 0;

  if (topScore >= 20) return true;
  if (phraseOccurrences >= 2 && distinctHits >= 1) return true;
  if (distinctHits >= distinctive.length && distinctive.length >= 2) return true;
  if (topScore >= 17 && secondScore >= 8) return true;

  // Single passing mention (e.g. "unlike AVL trees…") — not substantive.
  return false;
}

/** Re-rank retrieved chunks and drop unrelated materials when possible. */
export function rerankAndFilterTopicChunks<T extends TopicScorableChunk>(
  chunks: T[],
  query: string
): T[] {
  const topic = extractTopic(query) || query;
  const keywords = topicKeywords(query);
  if (!topic && keywords.length === 0) return chunks;

  const scored = chunks
    .map((chunk) => {
      const topicScore = scoreChunkForTopic(
        chunk.content,
        chunk.materialName,
        topic,
        keywords
      );
      return {
        chunk,
        topicScore,
        combined: topicScore + chunk.similarity * 3,
      };
    })
    .sort((a, b) => b.combined - a.combined);

  const relevant = scored.filter((s) => s.topicScore >= 5);

  // No fallback to unrelated chunks — empty means "not in materials".
  if (relevant.length === 0) return [];
  if (!hasSubstantiveTopicCoverage(relevant.map((s) => s.chunk), query)) {
    return [];
  }

  return relevant.map((s) => ({ ...s.chunk, similarity: s.combined }));
}

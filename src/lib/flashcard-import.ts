export interface ParsedFlashcard {
  question: string;
  answer: string;
  topic: string | null;
}

export type ImportFormat = "anki" | "markdown";

export interface ImportParseSuccess {
  ok: true;
  format: ImportFormat;
  cards: ParsedFlashcard[];
}

export interface ImportParseFailure {
  ok: false;
  message: string;
  hint?: string;
}

export type ImportParseResult = ImportParseSuccess | ImportParseFailure;

const MAX_CARDS = 500;
const MAX_FIELD_LEN = 5000;

export const FLASHCARD_IMPORT_GUIDE = `Clarify only accepts imports in one of these formats (same as Export):

**Anki CSV** — first line must be exactly:
Front,Back,Tags

Each row is one card. Tags become the topic (optional; use underscores for spaces).

**Clarify Markdown** — export from Clarify or match this pattern:
## Card 1
**Topic:** AVL Trees
**Q:** Your question here
**A:** Your answer here

Cards are separated by --- on its own line.`;

function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      fields.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current);
  return fields;
}

function normalizeField(value: string, label: string): string | ImportParseFailure {
  const trimmed = value.trim();
  if (!trimmed) {
    return {
      ok: false,
      message: `Each card needs a non-empty ${label}.`,
      hint: FLASHCARD_IMPORT_GUIDE,
    };
  }
  if (trimmed.length > MAX_FIELD_LEN) {
    return {
      ok: false,
      message: `${label} is too long (max ${MAX_FIELD_LEN} characters).`,
    };
  }
  return trimmed;
}

export function detectImportFormat(content: string): ImportFormat | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("# Flashcards") || /\*\*Q:\*\*/m.test(trimmed)) {
    return "markdown";
  }

  const header = trimmed.split(/\r?\n/)[0]?.trim().toLowerCase() ?? "";
  if (header === "front,back,tags" || header === "front,back") {
    return "anki";
  }

  return null;
}

function parseAnkiCsv(content: string): ImportParseResult {
  const lines = content.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return {
      ok: false,
      message: "CSV file is empty or has no card rows.",
      hint: "Use the header Front,Back,Tags then one row per card.",
    };
  }

  const header = lines[0].trim().toLowerCase();
  if (header !== "front,back,tags" && header !== "front,back") {
    return {
      ok: false,
      message: 'CSV header must be exactly "Front,Back,Tags" (or "Front,Back").',
      hint: "Export from Clarify with Anki CSV, or follow the import guide.",
    };
  }

  const hasTags = header === "front,back,tags";
  const cards: ParsedFlashcard[] = [];

  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvRow(lines[i]);
    if (fields.length < 2) continue;

    const question = normalizeField(fields[0], "Front");
    if (typeof question !== "string") return question;
    const answer = normalizeField(fields[1], "Back");
    if (typeof answer !== "string") return answer;

    const rawTags = hasTags ? (fields[2] ?? "").trim() : "";
    const topic = rawTags
      ? rawTags.replace(/_/g, " ").slice(0, 120)
      : null;

    cards.push({ question, answer, topic });
  }

  if (cards.length === 0) {
    return {
      ok: false,
      message: "No valid cards found in CSV.",
      hint: "Each row needs Front and Back columns filled in.",
    };
  }

  if (cards.length > MAX_CARDS) {
    return {
      ok: false,
      message: `Too many cards (${cards.length}). Import at most ${MAX_CARDS} at a time.`,
    };
  }

  return { ok: true, format: "anki", cards };
}

function parseMarkdown(content: string): ImportParseResult {
  const trimmed = content.trim();
  if (!trimmed.startsWith("# Flashcards") && !/\*\*Q:\*\*/m.test(trimmed)) {
    return {
      ok: false,
      message: "Markdown must start with # Flashcards or use **Q:** / **A:** pairs.",
      hint: "Export Markdown from Clarify, or copy the format from the import guide.",
    };
  }

  const sections = trimmed
    .split(/\n---\n/)
    .map((s) => s.trim())
    .filter(Boolean);

  const cards: ParsedFlashcard[] = [];

  for (const section of sections) {
    if (section.startsWith("# Flashcards")) continue;

    const qMatch = section.match(/\*\*Q:\*\*\s*([\s\S]*?)(?=\n\n\*\*A:\*\*|\n\*\*A:\*\*|$)/);
    const aMatch = section.match(/\*\*A:\*\*\s*([\s\S]*?)$/);
    if (!qMatch || !aMatch) continue;

    const question = normalizeField(qMatch[1], "question");
    if (typeof question !== "string") return question;
    const answer = normalizeField(aMatch[1], "answer");
    if (typeof answer !== "string") return answer;

    const topicMatch = section.match(/\*\*Topic:\*\*\s*(.+)/);
    const topic = topicMatch?.[1]?.trim().slice(0, 120) ?? null;

    cards.push({ question, answer, topic });
  }

  if (cards.length === 0) {
    return {
      ok: false,
      message: "No valid cards found in Markdown.",
      hint: "Each card needs **Q:** and **A:** lines. Separate cards with ---.",
    };
  }

  if (cards.length > MAX_CARDS) {
    return {
      ok: false,
      message: `Too many cards (${cards.length}). Import at most ${MAX_CARDS} at a time.`,
    };
  }

  return { ok: true, format: "markdown", cards };
}

export function parseFlashcardImport(
  content: string,
  format: "auto" | ImportFormat = "auto"
): ImportParseResult {
  const trimmed = content.trim();
  if (!trimmed) {
    return { ok: false, message: "File is empty." };
  }

  const detected = format === "auto" ? detectImportFormat(trimmed) : format;
  if (!detected) {
    return {
      ok: false,
      message: "Could not detect import format.",
      hint: FLASHCARD_IMPORT_GUIDE,
    };
  }

  return detected === "anki"
    ? parseAnkiCsv(trimmed)
    : parseMarkdown(trimmed);
}

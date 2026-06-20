import type { Flashcard } from "@/lib/types";

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

/** Anki-compatible CSV (Front, Back, Tags). */
export function flashcardsToAnkiCsv(cards: Flashcard[]): string {
  const header = "Front,Back,Tags";
  const rows = cards.map((c) => {
    const tags = c.topic ? c.topic.replace(/\s+/g, "_") : "Clarify";
    return [escapeCsv(c.question), escapeCsv(c.answer), escapeCsv(tags)].join(
      ","
    );
  });
  return [header, ...rows].join("\n");
}

export function flashcardsToMarkdown(cards: Flashcard[]): string {
  const sections = cards.map((c, i) => {
    const topic = c.topic ? `**Topic:** ${c.topic}\n\n` : "";
    return `## Card ${i + 1}\n\n${topic}**Q:** ${c.question}\n\n**A:** ${c.answer}`;
  });
  return `# Flashcards\n\n${sections.join("\n\n---\n\n")}\n`;
}

export function downloadTextFile(
  content: string,
  filename: string,
  mime = "text/plain;charset=utf-8"
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { generateText } from "@/lib/ai/gemini";
import { retrieve, type RetrievedChunk } from "@/lib/retrieval";
import { rerankAndFilterTopicChunks } from "@/lib/search-query";

export const maxDuration = 120;

interface TopicInput {
  title?: string;
  subtopics?: unknown;
}

type ParsedTopic = { title: string; subtopics: string[] };

function parseTopics(raw: unknown): ParsedTopic[] {
  return (Array.isArray(raw) ? raw : ([] as TopicInput[]))
    .map((t: TopicInput) => ({
      title: String(t.title ?? "").trim(),
      subtopics: Array.isArray(t.subtopics)
        ? t.subtopics.map((s) => String(s).trim()).filter(Boolean)
        : [],
    }))
    .filter((t) => t.title.length > 0)
    .slice(0, 8);
}

async function retrieveForTopics(
  supabase: Awaited<ReturnType<typeof requireCourse>>["supabase"],
  courseId: string,
  topics: ParsedTopic[]
) {
  const seen = new Set<string>();
  const sections: {
    title: string;
    subtopics: string[];
    chunks: RetrievedChunk[];
  }[] = [];

  for (const topic of topics) {
    const query = [topic.title, ...topic.subtopics].join(" ");
    let chunks = await retrieve(supabase, courseId, query, 10);
    chunks = rerankAndFilterTopicChunks(chunks, query);
    const unique = chunks.filter((chunk) => {
      if (seen.has(chunk.id)) return false;
      seen.add(chunk.id);
      return true;
    });
    sections.push({
      title: topic.title,
      subtopics: topic.subtopics,
      chunks: unique,
    });
  }

  return sections;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, course } = await requireCourse(id);

    const body = await req.json();
    const useMaterials = Boolean(body.useMaterials);
    const topics = parseTopics(body.topics);

    if (topics.length === 0) {
      throw new ApiError(400, "Add at least one thing you want explained.");
    }

    const topicBlock = topics
      .map((t) => {
        const subs =
          t.subtopics.length > 0
            ? `\n  Subtopics to explain in detail: ${t.subtopics.join(", ")}`
            : "";
        return `- ${t.title}${subs}`;
      })
      .join("\n");

    if (useMaterials) {
      const sections = await retrieveForTopics(supabase, id, topics);
      const covered = sections.filter((s) => s.chunks.length > 0);

      if (covered.length === 0) {
        throw new ApiError(
          400,
          "Your uploaded materials don't cover these topics yet. Upload relevant files or try different topics."
        );
      }

      const excerptBlocks = covered
        .map((section) => {
          const subs =
            section.subtopics.length > 0
              ? ` (focus: ${section.subtopics.join(", ")})`
              : "";
          const excerpts = section.chunks
            .map(
              (c, i) =>
                `[Excerpt ${i + 1} — ${c.materialName}]\n${c.content}`
            )
            .join("\n\n---\n\n");
          return `TOPIC: ${section.title}${subs}\n${excerpts}`;
        })
        .join("\n\n==========\n\n");

      const missing = sections
        .filter((s) => s.chunks.length === 0)
        .map((s) => s.title);

      const system = `You are a study-notes generator for "${course.name}". Using ONLY the provided excerpts, write detailed study notes. Do not use outside knowledge. Output well-structured Markdown only.`;

      const prompt = `Write thorough study notes for each topic below using ONLY the excerpts provided for that topic.

${topicBlock}

Rules:
- Start with a "#" title for the overall subject.
- Use "##" for each main topic and "###" for subtopics where helpful.
- **Bold** key terms found in the excerpts.
- Do not invent facts that are not supported by the excerpts.
- If a topic has no excerpts, write a brief "## [topic]" section stating that your materials do not cover it yet.${
        missing.length > 0
          ? `\n- Topics with no excerpts in your materials: ${missing.join(", ")}.`
          : ""
      }

MATERIAL EXCERPTS (grouped by topic):
${excerptBlocks}`;

      const notes = await generateText(prompt, system);
      const title =
        topics.length === 1
          ? topics[0].title
          : `${course.name} — Study Notes`;

      return NextResponse.json({ title, notes });
    }

    const system = `You are an expert tutor writing detailed, accurate study notes for a student in "${course.name}". Explain concepts clearly using plain language. Output well-structured Markdown only.`;

    const prompt = `Explain the following topics as thoroughly and clearly as you can. For each topic, cover every listed subtopic in depth — definitions, how it works, why it matters, and concrete examples.

${topicBlock}

Formatting:
- Start with a "#" title for the overall subject.
- Use "##" for each main topic and "###" for each subtopic.
- **Bold** key terms and important facts.
- Use bullet points and short paragraphs (not walls of text).
- End with a "## Quick Recap" bullet list of the most important points.`;

    const notes = await generateText(prompt, system);

    const title =
      topics.length === 1 ? topics[0].title : `${course.name} — Study Notes`;

    return NextResponse.json({ title, notes });
  });
}

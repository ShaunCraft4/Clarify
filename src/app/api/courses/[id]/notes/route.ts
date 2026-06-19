import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { generateText } from "@/lib/ai/gemini";
import { gatherCourseContent } from "@/lib/content";

export const maxDuration = 120;

interface TopicInput {
  title?: string;
  subtopics?: unknown;
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

    const topics = (Array.isArray(body.topics) ? body.topics : ([] as TopicInput[]))
      .map((t: TopicInput) => ({
        title: String(t.title ?? "").trim(),
        subtopics: Array.isArray(t.subtopics)
          ? t.subtopics.map((s) => String(s).trim()).filter(Boolean)
          : [],
      }))
      .filter((t: { title: string }) => t.title.length > 0)
      .slice(0, 8);

    if (topics.length === 0) {
      throw new ApiError(400, "Add at least one thing you want explained.");
    }

    const topicBlock = topics
      .map((t: { title: string; subtopics: string[] }) => {
        const subs =
          t.subtopics.length > 0
            ? `\n  Subtopics to explain in detail: ${t.subtopics.join(", ")}`
            : "";
        return `- ${t.title}${subs}`;
      })
      .join("\n");

    let materialBlock = "";
    if (useMaterials) {
      const content = await gatherCourseContent(supabase, id);
      if (content) {
        materialBlock = `\n\nThe student uploaded course materials. Where relevant, stay consistent with this content:\n"""\n${content.slice(0, 6000)}\n"""`;
      }
    }

    const system = `You are an expert tutor writing detailed, accurate study notes for a student in "${course.name}". Explain concepts clearly using plain language. Output well-structured Markdown only.`;

    const prompt = `Explain the following topics as thoroughly and clearly as you can. For each topic, cover every listed subtopic in depth — definitions, how it works, why it matters, and concrete examples.

${topicBlock}

Formatting:
- Start with a "#" title for the overall subject.
- Use "##" for each main topic and "###" for each subtopic.
- **Bold** key terms and important facts.
- Use bullet points and short paragraphs (not walls of text).
- End with a "## Quick Recap" bullet list of the most important points.${materialBlock}`;

    const notes = await generateText(prompt, system);

    const title =
      topics.length === 1
        ? topics[0].title
        : `${course.name} — Study Notes`;

    return NextResponse.json({ title, notes });
  });
}

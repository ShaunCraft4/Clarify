import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";
import { retrieve } from "@/lib/retrieval";
import { generateText } from "@/lib/ai/gemini";

export const maxDuration = 60;

interface Chunk {
  id: string;
  material_id: string;
  content: string;
  chunk_index: number;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, course } = await requireCourse(id);
    const body = await req.json();
    const query: string = String(body.query ?? "").trim();
    if (!query) {
      return NextResponse.json({ error: "Query is required" }, { status: 400 });
    }

    // Treat the query as ONE phrase unless the user separates topics with
    // commas. This stops "industrial revolution" from matching "russian
    // revolution" just because the word "revolution" is shared.
    const phrases = query.includes(",")
      ? query
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean)
      : [query];

    const contains = (text: string) =>
      phrases.some((p) => text.toLowerCase().includes(p.toLowerCase()));

    // 1. Semantic retrieval gives us good ranking…
    const semantic = await retrieve(supabase, id, query, 24);
    // …then we keep only chunks that literally contain a searched phrase.
    let chunks = semantic.filter((c) => contains(c.content));

    // 2. Fallback: a phrase may exist outside the semantic top-N. Pull exact
    // keyword matches straight from the table.
    if (chunks.length < 3) {
      const orExpr = phrases
        .map((p) => `content.ilike.%${p.replace(/[%,()]/g, " ")}%`)
        .join(",");
      const { data: kw } = await supabase
        .from("chunks")
        .select("id, material_id, content, chunk_index")
        .eq("course_id", id)
        .or(orExpr)
        .limit(12);

      const have = new Set(chunks.map((c) => c.id));
      const names = await materialNames(supabase, (kw as Chunk[]) ?? []);
      for (const k of (kw as Chunk[]) ?? []) {
        if (have.has(k.id)) continue;
        chunks.push({
          ...k,
          metadata: {},
          similarity: 0,
          materialName: names.get(k.material_id) ?? "Unknown",
        });
      }
    }

    chunks = chunks.slice(0, 10);

    if (chunks.length === 0) {
      return NextResponse.json({ notes: "", sources: [], empty: true });
    }

    const context = chunks
      .map((c, i) => `[Excerpt ${i + 1} — ${c.materialName}]\n${c.content}`)
      .join("\n\n---\n\n");

    const topicLabel = phrases.join(", ");
    const system = `You are a study-notes generator for the course "${course.name}". Using ONLY the provided excerpts from the student's own materials, write clean, well-organized study notes strictly about: "${topicLabel}". Ignore any excerpt content that is not about this exact topic. Use Markdown: a short bold title, logical "##" sub-headings, and concise bullet points. Bold key terms. Stay faithful to the materials and do not invent facts. If the excerpts don't actually cover this topic, say so briefly instead of writing about a different topic.`;

    const prompt = `Topic: "${topicLabel}"\n\nExcerpts from the student's materials:\n\n${context}`;

    const notes = await generateText(prompt, system);

    const seen = new Set<string>();
    const sources = [];
    for (const c of chunks) {
      if (seen.has(c.material_id)) continue;
      seen.add(c.material_id);
      sources.push({
        materialId: c.material_id,
        materialName: c.materialName,
        excerpt: c.content.slice(0, 220),
      });
    }

    return NextResponse.json({ notes, sources });
  });
}

async function materialNames(
  supabase: Awaited<ReturnType<typeof requireCourse>>["supabase"],
  chunks: Chunk[]
) {
  const ids = [...new Set(chunks.map((c) => c.material_id))];
  if (ids.length === 0) return new Map<string, string>();
  const { data } = await supabase
    .from("materials")
    .select("id, file_name")
    .in("id", ids);
  return new Map<string, string>(
    (data ?? []).map((m) => [m.id, m.file_name])
  );
}

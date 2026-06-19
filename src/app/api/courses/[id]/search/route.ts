import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";
import { retrieve, type RetrievedChunk } from "@/lib/retrieval";
import { generateText, withTimeout } from "@/lib/ai/gemini";
import type { SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const MAX_CHUNKS = 8;
const MAX_CONTEXT_CHARS = 10_000;

/** Queries asking for a full-course overview — skip literal phrase filtering. */
function isBroadQuery(query: string): boolean {
  const q = query.toLowerCase();
  return (
    /\b(everything|all materials?|all my materials?|entire course|whole course|full course)\b/.test(
      q
    ) ||
    /\b(summarize|summary|overview|explain|describe|review)\s+(all|everything|entire|whole|my)\b/.test(
      q
    ) ||
    /\bwhat\s+(is|are)\s+(covered|in)\s+(all|everything|my|the)\b/.test(q) ||
    /^summarize\b/i.test(query) ||
    /^overview\b/i.test(query)
  );
}

/** Comma-separated topics, otherwise one phrase. */
function extractPhrases(query: string): string[] {
  return query.includes(",")
    ? query
        .split(",")
        .map((p) => p.trim())
        .filter(Boolean)
    : [query];
}

/**
 * Match a topic phrase against chunk text. Multi-word phrases require every
 * word to appear (so "industrial revolution" won't match "russian revolution").
 */
function phraseMatchesContent(content: string, phrase: string): boolean {
  const lower = content.toLowerCase();
  const p = phrase.toLowerCase().trim();
  if (!p) return false;
  if (lower.includes(p)) return true;

  const words = p.split(/\s+/).filter((w) => w.length >= 3);
  if (words.length <= 1) {
    return words.length === 1 && lower.includes(words[0]);
  }
  return words.every((w) => lower.includes(w));
}

function chunkMatchesPhrases(content: string, phrases: string[]): boolean {
  return phrases.some((p) => phraseMatchesContent(content, p));
}

/** Evenly sample chunks across materials — fast, no embedding call. */
async function fetchRepresentativeChunks(
  supabase: SupabaseClient,
  courseId: string
): Promise<RetrievedChunk[]> {
  const { data: materials } = await supabase
    .from("materials")
    .select("id, file_name")
    .eq("course_id", courseId)
    .eq("status", "done")
    .order("uploaded_at", { ascending: true });

  if (!materials?.length) return [];

  const { data: allChunks } = await supabase
    .from("chunks")
    .select("id, material_id, content, chunk_index, metadata")
    .eq("course_id", courseId)
    .order("chunk_index", { ascending: true });

  if (!allChunks?.length) return [];

  const byMaterial = new Map<string, typeof allChunks>();
  for (const c of allChunks) {
    const list = byMaterial.get(c.material_id) ?? [];
    list.push(c);
    byMaterial.set(c.material_id, list);
  }

  const perMat = Math.max(1, Math.ceil(MAX_CHUNKS / materials.length));
  const out: RetrievedChunk[] = [];
  const nameById = new Map(materials.map((m) => [m.id, m.file_name]));

  for (const mat of materials) {
    const list = byMaterial.get(mat.id) ?? [];
    if (list.length === 0) continue;

    const step = Math.max(1, Math.floor(list.length / perMat));
    for (let i = 0; i < list.length; i += step) {
      const c = list[i];
      out.push({
        ...c,
        metadata: (c.metadata as RetrievedChunk["metadata"]) ?? {},
        similarity: 1,
        materialName: nameById.get(mat.id) ?? "Unknown",
      });
      if (out.filter((x) => x.material_id === mat.id).length >= perMat) break;
    }
  }

  return out.slice(0, MAX_CHUNKS);
}

function capContext(chunks: RetrievedChunk[]): RetrievedChunk[] {
  let total = 0;
  const kept: RetrievedChunk[] = [];
  for (const c of chunks) {
    if (kept.length >= MAX_CHUNKS) break;
    if (total + c.content.length > MAX_CONTEXT_CHARS && kept.length > 0) break;
    kept.push(c);
    total += c.content.length;
  }
  return kept;
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

    const broad = isBroadQuery(query);
    const phrases = extractPhrases(query);
    let chunks: RetrievedChunk[];

    if (broad) {
      // Overview queries: sample across all materials (no embedding round-trip).
      chunks = await fetchRepresentativeChunks(supabase, id);
    } else {
      // Topic queries: semantic search, then filter to relevant chunks only.
      const semantic = await retrieve(supabase, id, query, 16);
      chunks = semantic.filter((c) => chunkMatchesPhrases(c.content, phrases));

      // Keyword fallback if semantic + filter found too little.
      if (chunks.length < 2) {
        const { data: all } = await supabase
          .from("chunks")
          .select("id, material_id, content, chunk_index, metadata")
          .eq("course_id", id)
          .limit(80);

        const { data: mats } = await supabase
          .from("materials")
          .select("id, file_name")
          .eq("course_id", id);
        const names = new Map((mats ?? []).map((m) => [m.id, m.file_name]));
        const have = new Set(chunks.map((c) => c.id));

        for (const c of all ?? []) {
          if (have.has(c.id)) continue;
          if (!chunkMatchesPhrases(c.content, phrases)) continue;
          chunks.push({
            ...c,
            metadata: (c.metadata as RetrievedChunk["metadata"]) ?? {},
            similarity: 0,
            materialName: names.get(c.material_id) ?? "Unknown",
          });
        }
      }
    }

    chunks = capContext(chunks);

    if (chunks.length === 0) {
      return NextResponse.json({ notes: "", sources: [], empty: true });
    }

    const context = chunks
      .map((c, i) => `[Excerpt ${i + 1} — ${c.materialName}]\n${c.content}`)
      .join("\n\n---\n\n");

    const topicLabel = broad ? "all course materials" : phrases.join(", ");
    const system = broad
      ? `You are a study-notes generator for "${course.name}". Using ONLY the provided excerpts, write a clear, well-organized overview of what the student's materials cover. Use Markdown with a title, "##" sections by theme/topic, and bullet points. Bold key terms. Do not invent facts.`
      : `You are a study-notes generator for "${course.name}". Using ONLY the provided excerpts, write clean study notes about: "${topicLabel}". Ignore unrelated content. Use Markdown with a title, "##" sub-headings, and bullet points. Bold key terms. Stay faithful to the materials.`;

    const prompt = broad
      ? `Write an overview of everything covered in these course materials:\n\n${context}`
      : `Topic: "${topicLabel}"\n\nExcerpts:\n\n${context}`;

    const notes = await withTimeout(
      generateText(prompt, system),
      40_000,
      "Search"
    );

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

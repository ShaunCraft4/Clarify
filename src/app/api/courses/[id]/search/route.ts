import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";
import { retrieve, type RetrievedChunk } from "@/lib/retrieval";
import { generateText, withTimeout } from "@/lib/ai/gemini";
import {
  isBroadOverviewQuery,
  extractTopic,
  topicKeywords,
  keywordScore,
} from "@/lib/search-query";
import type { SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 60;

const BROAD_MAX_CHUNKS = 16;
const BROAD_MAX_CONTEXT = 14_000;
const TOPIC_MAX_CHUNKS = 10;
const TOPIC_MAX_CONTEXT = 10_000;

/** Evenly sample chunks across materials — no embedding call. */
async function fetchRepresentativeChunks(
  supabase: SupabaseClient,
  courseId: string,
  maxChunks: number
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

  const perMat = Math.max(1, Math.ceil(maxChunks / materials.length));
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

  return out.slice(0, maxChunks);
}

/** Keyword scan when semantic search returns too little. */
async function fetchKeywordChunks(
  supabase: SupabaseClient,
  courseId: string,
  keywords: string[],
  maxChunks: number
): Promise<RetrievedChunk[]> {
  if (keywords.length === 0) return [];

  const { data: all } = await supabase
    .from("chunks")
    .select("id, material_id, content, chunk_index, metadata")
    .eq("course_id", courseId)
    .limit(200);

  if (!all?.length) return [];

  const { data: mats } = await supabase
    .from("materials")
    .select("id, file_name")
    .eq("course_id", courseId);
  const names = new Map((mats ?? []).map((m) => [m.id, m.file_name]));

  const scored = all
    .map((c) => ({
      ...c,
      metadata: (c.metadata as RetrievedChunk["metadata"]) ?? {},
      similarity: keywordScore(c.content, keywords) / keywords.length,
      materialName: names.get(c.material_id) ?? "Unknown",
    }))
    .filter((c) => c.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity);

  return scored.slice(0, maxChunks);
}

function capContext(
  chunks: RetrievedChunk[],
  maxChunks: number,
  maxChars: number
): RetrievedChunk[] {
  let total = 0;
  const kept: RetrievedChunk[] = [];
  for (const c of chunks) {
    if (kept.length >= maxChunks) break;
    if (total + c.content.length > maxChars && kept.length > 0) break;
    kept.push(c);
    total += c.content.length;
  }
  return kept;
}

function dedupeChunks(chunks: RetrievedChunk[]): RetrievedChunk[] {
  const seen = new Set<string>();
  return chunks.filter((c) => {
    if (seen.has(c.id)) return false;
    seen.add(c.id);
    return true;
  });
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

    const broad = isBroadOverviewQuery(query);
    const maxChunks = broad ? BROAD_MAX_CHUNKS : TOPIC_MAX_CHUNKS;
    const maxContext = broad ? BROAD_MAX_CONTEXT : TOPIC_MAX_CONTEXT;
    let chunks: RetrievedChunk[];

    if (broad) {
      chunks = await fetchRepresentativeChunks(supabase, id, maxChunks);
    } else {
      // Semantic search understands natural phrasing — trust it, don't keyword-filter.
      const topic = extractTopic(query);
      const searchText = topic.length >= 2 ? topic : query;
      const semantic = await retrieve(supabase, id, searchText, maxChunks + 6);
      chunks = semantic;

      // Merge in keyword matches for typos / exact terminology the embedder missed.
      const keywords = topicKeywords(query);
      if (keywords.length > 0) {
        const keywordHits = await fetchKeywordChunks(
          supabase,
          id,
          keywords,
          maxChunks
        );
        chunks = dedupeChunks([...chunks, ...keywordHits]);
      }

      // Still nothing — sample materials and rank by keywords.
      if (chunks.length < 2) {
        const sample = await fetchRepresentativeChunks(
          supabase,
          id,
          maxChunks * 2
        );
        const keywords = topicKeywords(query);
        chunks = sample
          .map((c) => ({
            ...c,
            similarity: keywordScore(c.content, keywords) / Math.max(keywords.length, 1),
          }))
          .filter((c) => c.similarity > 0)
          .sort((a, b) => b.similarity - a.similarity);
      }
    }

    chunks = capContext(chunks, maxChunks, maxContext);

    if (chunks.length === 0) {
      return NextResponse.json({ notes: "", sources: [], empty: true });
    }

    const context = chunks
      .map((c, i) => `[Excerpt ${i + 1} — ${c.materialName}]\n${c.content}`)
      .join("\n\n---\n\n");

    const topicLabel = broad
      ? "all course materials"
      : extractTopic(query) || query;

    const system = broad
      ? `You are a study-notes generator for "${course.name}". Using ONLY the provided excerpts, write a thorough, well-organized recap of what the student's materials cover. Use Markdown with a title, "##" sections by theme/topic, and bullet points. Be comprehensive — cover every major theme present in the excerpts. Bold key terms. Do not invent facts.`
      : `You are a study-notes generator for "${course.name}". Using ONLY the provided excerpts, write detailed study notes about: "${topicLabel}". Include definitions, key ideas, examples, and important details found in the excerpts. Use Markdown with a title, "##" sub-headings, and bullet points. Bold key terms. Stay faithful to the materials — do not invent content not supported by the excerpts.`;

    const prompt = broad
      ? `Write a comprehensive overview of everything covered in these course materials:\n\n${context}`
      : `Topic: "${topicLabel}"\n\nWrite thorough study notes on this topic using these excerpts:\n\n${context}`;

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

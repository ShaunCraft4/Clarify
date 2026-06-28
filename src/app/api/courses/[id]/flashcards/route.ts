import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";
import { countDueFlashcards } from "@/lib/srs";
import { isMissingColumn } from "@/lib/db-schema";
import type { SupabaseClient } from "@supabase/supabase-js";

async function loadSourceMap(
  supabase: SupabaseClient,
  chunkIds: string[]
) {
  const map = new Map<
    string,
    { excerpt: string; materialName: string | null }
  >();
  if (chunkIds.length === 0) return map;

  const { data: chunks } = await supabase
    .from("chunks")
    .select("id, content, material_id")
    .in("id", chunkIds);

  const materialIds = [
    ...new Set((chunks ?? []).map((c) => c.material_id).filter(Boolean)),
  ];
  const names = new Map<string, string>();
  if (materialIds.length) {
    const { data: mats } = await supabase
      .from("materials")
      .select("id, file_name")
      .in("id", materialIds);
    for (const m of mats ?? []) names.set(m.id, m.file_name);
  }

  for (const c of chunks ?? []) {
    map.set(c.id, {
      excerpt: c.content.slice(0, 280),
      materialName: names.get(c.material_id) ?? null,
    });
  }
  return map;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);

    let { data, error } = await supabase
      .from("flashcards")
      .select("*")
      .eq("course_id", id)
      .order("due_at", { ascending: true });

    if (isMissingColumn(error)) {
      ({ data, error } = await supabase
        .from("flashcards")
        .select("*")
        .eq("course_id", id)
        .order("created_at", { ascending: false }));
    }
    if (error) throw error;

    const chunkIds = [
      ...new Set(
        (data ?? [])
          .map((c) => c.source_chunk_id as string | null)
          .filter(Boolean) as string[]
      ),
    ];
    const sources = await loadSourceMap(supabase, chunkIds);

    const flashcards = (data ?? []).map((card) => {
      const src = card.source_chunk_id
        ? sources.get(card.source_chunk_id as string)
        : null;
      return {
        ...card,
        ease_factor: card.ease_factor ?? 2.5,
        interval_days: card.interval_days ?? 0,
        due_at: card.due_at ?? card.created_at,
        source_material: src?.materialName ?? null,
        source_excerpt: src?.excerpt ?? null,
      };
    });

    const dueCount = countDueFlashcards(flashcards);

    return NextResponse.json({ flashcards, dueCount });
  });
}

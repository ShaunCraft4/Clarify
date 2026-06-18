import { NextResponse } from "next/server";
import { handle, requireCourse, ApiError } from "@/lib/api";
import { generateJSON } from "@/lib/ai/gemini";
import { gatherCourseContent } from "@/lib/content";
import type { DependencyGraph } from "@/lib/types";

export const maxDuration = 60;

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);

    const content = await gatherCourseContent(supabase, id);
    if (!content) {
      throw new ApiError(
        400,
        "No processed material content found. Upload materials first."
      );
    }

    const prompt = `Extract the key concepts from the following course materials and infer prerequisite relationships between them. An edge "from" -> "to" means "from" is a prerequisite for "to". Keep it to the 8-16 most important concepts. Use concise concept labels. Return JSON: { "nodes": [{ "id": "avl-trees", "label": "AVL Trees" }], "edges": [{ "from": "bst", "to": "avl-trees" }] }. Node ids must be lowercase kebab-case and edges must reference existing node ids.\n\nMATERIALS:\n${content}`;

    const graph = await generateJSON<DependencyGraph>(
      prompt,
      'You must respond with valid JSON only — an object with "nodes" and "edges". No markdown.'
    );

    // Attach mastery scores to nodes (matched by label, case-insensitive).
    const { data: mastery } = await supabase
      .from("topic_mastery")
      .select("topic, mastery_score")
      .eq("course_id", id);
    const scoreByTopic = new Map(
      (mastery ?? []).map((m) => [m.topic.toLowerCase(), m.mastery_score])
    );

    const nodes = (graph.nodes ?? []).map((n) => ({
      ...n,
      mastery: scoreByTopic.get(n.label.toLowerCase()) ?? null,
    }));
    const nodeIds = new Set(nodes.map((n) => n.id));
    const edges = (graph.edges ?? []).filter(
      (e) => nodeIds.has(e.from) && nodeIds.has(e.to)
    );

    return NextResponse.json({ nodes, edges });
  });
}

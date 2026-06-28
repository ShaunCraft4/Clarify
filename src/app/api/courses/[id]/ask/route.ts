import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";
import { isMissingTable } from "@/lib/db-schema";
import { retrieve, buildContext } from "@/lib/retrieval";
import { generateText } from "@/lib/ai/gemini";
import {
  resolveStudyQuery,
  rerankAndFilterTopicChunks,
} from "@/lib/search-query";
import type { Citation } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";

export const maxDuration = 60;

/**
 * Persist a question + answer turn so the conversation survives across
 * browsers/devices. Returns saved message ids (and a `persisted` flag so the
 * client can fall back to local storage when the table isn't migrated yet).
 */
async function persistTurn(
  supabase: SupabaseClient,
  courseId: string,
  userId: string,
  question: string,
  answer: string,
  citations: Citation[]
) {
  try {
    const { data, error } = await supabase
      .from("chat_messages")
      .insert([
        { course_id: courseId, user_id: userId, role: "user", content: question },
        {
          course_id: courseId,
          user_id: userId,
          role: "assistant",
          content: answer,
          citations,
        },
      ])
      .select("id, role");

    if (error) {
      if (isMissingTable(error)) return { persisted: false };
      throw error;
    }

    const rows = (data ?? []) as { id: string; role: string }[];
    return {
      persisted: true,
      userMessageId: rows.find((r) => r.role === "user")?.id,
      assistantMessageId: rows.find((r) => r.role === "assistant")?.id,
    };
  } catch (err) {
    // Never let persistence failure break the answer itself, but log it so the
    // cause is visible in server logs instead of failing silently.
    console.error("[ask] failed to persist chat messages:", err);
    return { persisted: false };
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user, course } = await requireCourse(id);
    const body = await req.json();
    const question = (body.question ?? "").toString().trim();
    const mode: "answer" | "tutor" = body.mode === "tutor" ? "tutor" : "answer";
    if (!question) {
      return NextResponse.json(
        { error: "Question is required" },
        { status: 400 }
      );
    }

    const resolved = resolveStudyQuery(question);
    let chunks = await retrieve(supabase, id, resolved.searchText, 8);

    if (chunks.length === 0) {
      const answer =
        "I couldn't find anything in this course's materials related to your question. Try uploading more materials or rephrasing.";
      const saved = await persistTurn(supabase, id, user.id, question, answer, []);
      return NextResponse.json({ answer, citations: [], ...saved });
    }

    if (!resolved.isBroad) {
      chunks = rerankAndFilterTopicChunks(chunks, question);
      if (chunks.length === 0) {
        const answer = `Your uploaded materials don't appear to cover **${resolved.topic}**. They may mention it briefly when comparing other topics, but there's no dedicated content to answer from. Try asking about a topic in your materials, or upload notes on **${resolved.topic}**.`;
        const saved = await persistTurn(supabase, id, user.id, question, answer, []);
        return NextResponse.json({ answer, citations: [], ...saved });
      }
    } else {
      chunks = chunks.slice(0, 5);
    }

    const { context, citations } = buildContext(chunks);

    const styleRules = `Write for a student who wants a clear, easy-to-understand explanation:
- Use plain, friendly language. Explain jargon in simple terms.
- Keep it well-structured but lightweight: short paragraphs, and simple bullet points ("- ") only when listing things.
- Do NOT over-format. Use **bold** sparingly for genuinely key terms only — never wrap whole sentences in asterisks.
- No headings unless the answer is long. Get to the point.`;

    const system =
      mode === "tutor"
        ? `You are a Socratic tutor for ${course.name}. NEVER directly answer the student's question. Instead, ask 1-3 guiding questions that lead them to the answer themselves, grounded in the provided course materials. If the student's message contains a factual claim that contradicts the materials, gently point out the misconception first using a Markdown blockquote line starting with "> ⚠️ Correction:". ${styleRules}`
        : `You are a study assistant for ${course.name}. Answer only using the provided context from the student's own materials. Mention which material the information comes from in a natural way. If the answer isn't in the context, say so clearly. If the student's message contains a factual claim that contradicts the materials, correct the misconception FIRST using a Markdown blockquote line starting with "> ⚠️ Correction:", then give the correct explanation. ${styleRules}`;

    const prompt = `Context from the student's materials:\n\n${context}\n\n---\n\nStudent's message: ${question}`;

    const answer = await generateText(prompt, system);

    const saved = await persistTurn(supabase, id, user.id, question, answer, citations);

    return NextResponse.json({ answer, citations, ...saved });
  });
}

import { NextRequest, NextResponse } from "next/server";
import { handle, requireCourse } from "@/lib/api";
import { isMissingTable } from "@/lib/db-schema";
import type { Citation } from "@/lib/types";

interface ChatRow {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations: Citation[] | null;
}

function toMessage(row: ChatRow) {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    citations: Array.isArray(row.citations) ? row.citations : undefined,
  };
}

/** Load the saved Ask conversation for this course. */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase } = await requireCourse(id);

    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, role, content, citations")
      .eq("course_id", id)
      .order("seq", { ascending: true });

    if (error) {
      // Table not migrated yet — let the client fall back to local storage.
      if (isMissingTable(error)) {
        return NextResponse.json({ messages: [], persisted: false });
      }
      throw error;
    }

    return NextResponse.json({
      messages: (data as ChatRow[]).map(toMessage),
      persisted: true,
    });
  });
}

/** Delete one message (?messageId=) or clear the whole conversation. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return handle(async () => {
    const { id } = await params;
    const { supabase, user } = await requireCourse(id);
    const messageId = req.nextUrl.searchParams.get("messageId");

    let query = supabase
      .from("chat_messages")
      .delete()
      .eq("course_id", id)
      .eq("user_id", user.id);

    if (messageId) query = query.eq("id", messageId);

    const { error } = await query;
    if (error && !isMissingTable(error)) throw error;

    return NextResponse.json({ ok: true });
  });
}

"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { apiFetch } from "@/lib/fetcher";
import type { Citation } from "@/lib/types";
import { cn } from "@/lib/cn";
import { recordStudyActivity } from "@/lib/study-streak";
import ActivityProgress, { ACTIVITY_ESTIMATES } from "@/components/ActivityProgress";
import { CitationSource } from "@/components/CitationSource";
import { Send, MessageSquare, Trash2, X, FileText } from "lucide-react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
}

function newMessageId() {
  return crypto.randomUUID();
}

function normalizeMessages(raw: unknown): Message[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m, i) => {
    const row = m as Partial<Message>;
    return {
      id: row.id ?? `legacy-${i}-${row.role ?? "msg"}`,
      role: row.role === "assistant" ? "assistant" : "user",
      content: String(row.content ?? ""),
      citations: Array.isArray(row.citations) ? row.citations : undefined,
    };
  });
}

function AssistantText({ text }: { text: string }) {
  return (
    <div className="prose-notes text-sm">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

export default function AskTab({
  courseId,
  courseName,
  onOpenMaterial,
}: {
  courseId: string;
  courseName: string;
  onOpenMaterial?: (materialId: string) => void;
}) {
  const storageKey = `clarify:chat:${courseId}`;
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [openCitation, setOpenCitation] = useState<string | null>(null);
  const [hydrated, setHydrated] = useState(false);
  // "db" once we confirm the conversation is saved server-side, "local" if the
  // chat table isn't migrated yet (graceful fallback to per-browser storage).
  const [persistMode, setPersistMode] = useState<"db" | "local">("local");
  const endRef = useRef<HTMLDivElement>(null);
  // Mirror of `loading` so the focus-sync handler can bail out mid-send without
  // re-subscribing the listener on every keystroke.
  const loadingRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    function readLocal(): Message[] {
      try {
        const saved = localStorage.getItem(storageKey);
        return saved ? normalizeMessages(JSON.parse(saved)) : [];
      } catch {
        return [];
      }
    }

    (async () => {
      try {
        const { messages: serverMessages, persisted } = await apiFetch<{
          messages: Message[];
          persisted: boolean;
        }>(`/api/courses/${courseId}/chat`);
        if (cancelled) return;
        if (persisted) {
          setPersistMode("db");
          const normalized = normalizeMessages(serverMessages);
          // Prefer the DB conversation, but if it's empty fall back to this
          // browser's local copy so nothing is ever lost on refresh.
          setMessages(normalized.length > 0 ? normalized : readLocal());
          setHydrated(true);
          return;
        }
      } catch {
        /* fall through to local storage */
      }
      if (cancelled) return;
      setMessages(readLocal());
      setHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [courseId, storageKey]);

  // Always keep a local backup, even in DB mode, so a failed/slow write never
  // makes the conversation disappear on refresh within the same browser.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(messages));
    } catch {
      /* ignore */
    }
  }, [messages, hydrated, storageKey]);

  useEffect(() => {
    loadingRef.current = loading;
  }, [loading]);

  // Re-pull the conversation from the account when the tab regains focus, so
  // changes made in another browser/device (new questions, deletes, clear all)
  // show up without a manual refresh.
  useEffect(() => {
    if (persistMode !== "db") return;
    async function syncFromServer() {
      if (document.hidden || loadingRef.current) return;
      try {
        const { messages: serverMessages, persisted } = await apiFetch<{
          messages: Message[];
          persisted: boolean;
        }>(`/api/courses/${courseId}/chat`);
        if (persisted && !loadingRef.current) {
          setMessages(normalizeMessages(serverMessages));
        }
      } catch {
        /* ignore transient sync errors */
      }
    }
    window.addEventListener("focus", syncFromServer);
    document.addEventListener("visibilitychange", syncFromServer);
    return () => {
      window.removeEventListener("focus", syncFromServer);
      document.removeEventListener("visibilitychange", syncFromServer);
    };
  }, [courseId, persistMode]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const question = input.trim();
    if (!question || loading) return;
    setInput("");
    const tempUserId = newMessageId();
    setMessages((m) => [
      ...m,
      { id: tempUserId, role: "user", content: question },
    ]);
    setLoading(true);
    try {
      const { answer, citations, userMessageId, assistantMessageId } =
        await apiFetch<{
          answer: string;
          citations: Citation[];
          persisted?: boolean;
          userMessageId?: string;
          assistantMessageId?: string;
        }>(`/api/courses/${courseId}/ask`, {
          method: "POST",
          body: JSON.stringify({ question }),
        });
      if (userMessageId) setPersistMode("db");
      setMessages((m) => [
        // Swap the optimistic user id for the saved one so deletes target the DB.
        ...m.map((msg) =>
          msg.id === tempUserId && userMessageId
            ? { ...msg, id: userMessageId }
            : msg
        ),
        {
          id: assistantMessageId ?? newMessageId(),
          role: "assistant",
          content: answer,
          citations,
        },
      ]);
      recordStudyActivity();
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: newMessageId(),
          role: "assistant",
          content: err instanceof Error ? err.message : "Something went wrong.",
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(
        () => endRef.current?.scrollIntoView({ behavior: "smooth" }),
        50
      );
    }
  }

  function removeMessage(id: string) {
    setMessages((m) => m.filter((msg) => msg.id !== id));
    setOpenCitation(null);
    if (persistMode === "db") {
      apiFetch(
        `/api/courses/${courseId}/chat?messageId=${encodeURIComponent(id)}`,
        { method: "DELETE" }
      ).catch(() => {
        /* ignore */
      });
    }
  }

  function clearChat() {
    if (!confirm("Clear this conversation?")) return;
    setMessages([]);
    setOpenCitation(null);
    if (persistMode === "db") {
      apiFetch(`/api/courses/${courseId}/chat`, { method: "DELETE" }).catch(
        () => {
          /* ignore */
        }
      );
    } else {
      try {
        localStorage.removeItem(storageKey);
      } catch {
        /* ignore */
      }
    }
  }

  return (
    <div className="flex flex-col h-full max-w-3xl mx-auto w-full">
      <div className="flex items-center justify-between px-6 py-3 border-b border-slate-200 bg-white">
        <p className="text-sm text-slate-500">
          Ask questions grounded in <b>{courseName}</b>&apos;s materials.
        </p>
        {messages.length > 0 && (
          <button
            type="button"
            onClick={clearChat}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <Trash2 className="h-4 w-4" />
            Clear all
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-5">
        {messages.length === 0 && (
          <div className="text-center text-slate-400 mt-16">
            <MessageSquare className="h-10 w-10 mx-auto mb-3" />
            <p>Ask anything about your uploaded materials.</p>
            <p className="text-xs mt-1">
              Your conversation is saved so you can revisit it later.
            </p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "flex group",
              m.role === "user" ? "justify-end" : "justify-start"
            )}
          >
            <div
              className={cn(
                "relative max-w-[85%] rounded-2xl px-4 py-3 animate-fade-in",
                m.role === "user"
                  ? "bg-brand-600 text-white"
                  : "bg-white border border-slate-200"
              )}
            >
              <button
                type="button"
                onClick={() => removeMessage(m.id)}
                title={
                  m.role === "user" ? "Remove this question" : "Remove this answer"
                }
                className={cn(
                  "absolute -top-2 rounded-full p-1 opacity-0 transition group-hover:opacity-100 focus:opacity-100",
                  m.role === "user"
                    ? "-left-2 bg-white text-slate-500 shadow-sm hover:text-red-600"
                    : "-right-2 bg-slate-100 text-slate-500 hover:bg-red-50 hover:text-red-600"
                )}
              >
                <X className="h-3.5 w-3.5" />
              </button>

              {m.role === "assistant" ? (
                <AssistantText text={m.content} />
              ) : (
                <p className="text-sm leading-relaxed">{m.content}</p>
              )}

              {m.citations && m.citations.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {m.citations.map((c) => (
                    <button
                      key={c.chunkId}
                      type="button"
                      onClick={() =>
                        setOpenCitation(
                          openCitation === c.chunkId ? null : c.chunkId
                        )
                      }
                      className="inline-flex items-center gap-1 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs px-2.5 py-1"
                    >
                      <FileText className="h-3 w-3" />
                      {c.materialName}
                      {c.page ? ` p.${c.page}` : ""}
                    </button>
                  ))}
                </div>
              )}
              {m.citations
                ?.filter((c) => c.chunkId === openCitation)
                .map((c) => (
                  <div key={c.chunkId} className="mt-2">
                    <CitationSource
                      materialId={c.materialId}
                      materialName={c.materialName}
                      excerpt={c.excerpt}
                      page={c.page}
                      chunkIndex={c.chunkIndex}
                      onOpenMaterial={onOpenMaterial}
                    />
                  </div>
                ))}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start max-w-md">
            <ActivityProgress
              active={loading}
              label="Thinking…"
              estimateSeconds={ACTIVITY_ESTIMATES.ask}
              hint="Searching your materials and drafting an answer."
            />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={send}
        className="border-t border-slate-200 bg-white p-4 flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask a question…"
          className="flex-1 rounded-lg border border-slate-300 px-4 py-2.5 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="btn-primary px-4 py-2.5"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}

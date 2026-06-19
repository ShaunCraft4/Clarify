#!/usr/bin/env node
/**
 * Clarify smoke test — hits core API routes with a temporary test user.
 * Usage: npm run dev (separate terminal) then npm run smoke
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      const k = t.slice(0, i).trim();
      const v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

const BASE = process.env.SMOKE_BASE_URL || "http://localhost:3000";
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const GOOGLE_KEY = process.env.GOOGLE_AI_API_KEY;

const results = [];

function pass(name, detail = "") {
  results.push({ name, ok: true, detail });
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
}
function fail(name, detail = "") {
  results.push({ name, ok: false, detail });
  console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, opts = {}, cookie = "") {
  const headers = { ...(opts.headers || {}) };
  if (cookie) headers.Cookie = cookie;
  if (opts.body && !(opts.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  const res = await fetch(`${BASE}${path}`, { ...opts, headers });
  const text = await res.text();
  let json = {};
  try {
    json = JSON.parse(text);
  } catch {
    json = { raw: text.slice(0, 200) };
  }
  return { res, json };
}

function buildAuthCookie(session) {
  const ref = new URL(SUPABASE_URL).hostname.split(".")[0];
  const payload = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type,
    user: session.user,
  });
  return `sb-${ref}-auth-token=${encodeURIComponent(payload)}`;
}

async function main() {
  console.log("\nClarify smoke test\n");

  // ── Environment ──
  if (!SUPABASE_URL || !ANON_KEY) {
    fail("env", "Missing Supabase env vars");
    process.exit(1);
  }
  pass("env", "Supabase configured");
  if (GOOGLE_KEY) pass("env", "Google AI key present");
  else fail("env", "GOOGLE_AI_API_KEY missing — AI routes will fail");

  // ── Server up? ──
  try {
    const ping = await fetch(`${BASE}/login`, { redirect: "manual" });
    if (ping.status >= 500) throw new Error(`HTTP ${ping.status}`);
    pass("server", BASE);
  } catch (e) {
    fail("server", `Not reachable (${e.message}). Run npm run dev first.`);
    process.exit(1);
  }

  // ── Auth ──
  const supabase = createClient(SUPABASE_URL, ANON_KEY);
  const email = process.env.SMOKE_EMAIL || `smoke-${Date.now()}@clarify.test`;
  const password = process.env.SMOKE_PASSWORD || "smoke-test-pass-123456";

  let session;
  {
    let { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      ({ data, error } = await supabase.auth.signUp({ email, password }));
    }
    if (error || !data.session) {
      fail("auth", error?.message || "No session");
      process.exit(1);
    }
    session = data.session;
    pass("auth", email);
  }

  const cookie = buildAuthCookie(session);

  // ── Usage meter ──
  {
    const { res, json } = await api("/api/usage", {}, cookie);
    if (res.ok && typeof json.minute?.remaining === "number") {
      pass("GET /api/usage", `${json.minute.remaining} left this minute`);
    } else fail("GET /api/usage", JSON.stringify(json));
  }

  // ── Courses ──
  let courseId;
  {
    const { res, json } = await api(
      "/api/courses",
      {
        method: "POST",
        body: JSON.stringify({
          name: `Smoke Test ${Date.now()}`,
          description: "Auto-generated smoke test course",
        }),
      },
      cookie
    );
    if (res.ok && json.course?.id) {
      courseId = json.course.id;
      pass("POST /api/courses", courseId);
    } else {
      fail("POST /api/courses", JSON.stringify(json));
      process.exit(1);
    }
  }

  {
    const { res } = await api(`/api/courses/${courseId}/materials`, {}, cookie);
    res.ok ? pass("GET /api/courses/:id/materials") : fail("GET materials");
  }

  // Upload a tiny notes file as material
  {
    const fd = new FormData();
    const blob = new Blob(
      [
        "# Smoke test material\n\nThe mitochondria is the powerhouse of the cell.\n\nPhotosynthesis converts light energy into chemical energy.",
      ],
      { type: "text/plain" }
    );
    fd.append("file", blob, "smoke-notes.txt");
    fd.append("fileType", "notes");
    const { res, json } = await api(
      `/api/courses/${courseId}/materials`,
      { method: "POST", body: fd },
      cookie
    );
    if (res.ok && json.material?.id) {
      pass("POST /api/courses/:id/materials", "uploaded test notes");
      // Wait for processing
      let done = false;
      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const { json: mats } = await api(
          `/api/courses/${courseId}/materials`,
          {},
          cookie
        );
        const m = mats.materials?.find((x) => x.id === json.material.id);
        if (m?.status === "done") {
          done = true;
          pass("material pipeline", `${m.chunk_count} chunks`);
          break;
        }
        if (m?.status === "error") {
          fail("material pipeline", m.error);
          break;
        }
      }
      if (!done) fail("material pipeline", "Timed out waiting for embedding");
    } else {
      fail("POST /api/courses/:id/materials", JSON.stringify(json));
    }
  }

  // ── Search (topic + broad) ──
  if (GOOGLE_KEY) {
    for (const q of ["mitochondria", "Explain everything in all the materials"]) {
      const t0 = Date.now();
      const { res, json } = await api(
        `/api/courses/${courseId}/search`,
        { method: "POST", body: JSON.stringify({ query: q }) },
        cookie
      );
      const ms = Date.now() - t0;
      if (res.ok && !json.empty && json.notes?.length > 20) {
        pass(`POST search "${q.slice(0, 30)}…"`, `${ms}ms`);
      } else if (res.ok && json.empty) {
        fail(`POST search "${q.slice(0, 30)}"`, "empty result");
      } else {
        fail(`POST search`, json.error || JSON.stringify(json));
      }
    }
  }

  // ── Notes generation ──
  if (GOOGLE_KEY) {
    const t0 = Date.now();
    const { res, json } = await api(
      `/api/courses/${courseId}/notes`,
      {
        method: "POST",
        body: JSON.stringify({
          topics: [{ title: "Cell biology", subtopics: ["mitochondria"] }],
          useMaterials: true,
          webResearch: false,
        }),
      },
      cookie
    );
    const ms = Date.now() - t0;
    if (res.ok && json.notes?.length > 50) {
      pass("POST /api/courses/:id/notes", `${ms}ms`);
    } else {
      fail("POST notes", json.error || JSON.stringify(json).slice(0, 120));
    }
  }

  // ── Ask ──
  if (GOOGLE_KEY) {
    const { res, json } = await api(
      `/api/courses/${courseId}/ask`,
      {
        method: "POST",
        body: JSON.stringify({ question: "What is the powerhouse of the cell?" }),
      },
      cookie
    );
    if (res.ok && json.answer?.length > 10) pass("POST /api/courses/:id/ask");
    else fail("POST ask", json.error || "no answer");
  }

  // ── Flashcards ──
  if (GOOGLE_KEY) {
    const { res, json } = await api(
      `/api/courses/${courseId}/flashcards/generate`,
      { method: "POST", body: JSON.stringify({ count: 3 }) },
      cookie
    );
    if (res.ok && (json.flashcards?.length > 0 || json.count > 0)) {
      pass("POST flashcards/generate");
    } else {
      fail("POST flashcards/generate", json.error || JSON.stringify(json));
    }
  }

  {
    const { res } = await api(`/api/courses/${courseId}/flashcards`, {}, cookie);
    res.ok ? pass("GET flashcards") : fail("GET flashcards");
  }

  // ── Quizzes ──
  if (GOOGLE_KEY) {
    const { res, json } = await api(
      `/api/courses/${courseId}/quizzes/generate`,
      {
        method: "POST",
        body: JSON.stringify({
          title: "Smoke quiz",
          multipleChoice: 2,
          trueFalse: 1,
          shortAnswer: 1,
        }),
      },
      cookie
    );
    if (res.ok && json.quiz?.id) {
      pass("POST quizzes/generate", json.quiz.id);
      const quizId = json.quiz.id;
      const { res: gRes, json: quiz } = await api(
        `/api/quizzes/${quizId}`,
        {},
        cookie
      );
      if (gRes.ok && quiz.quiz?.questions?.length) {
        pass("GET /api/quizzes/:id", `${quiz.quiz.questions.length} questions`);
        const answers = quiz.quiz.questions.map((q) => ({
          questionId: q.id,
          answer: q.type === "multiple_choice" ? q.options?.[0] ?? "A" : "test",
        }));
        const { res: aRes, json: attempt } = await api(
          `/api/quizzes/${quizId}/attempt`,
          { method: "POST", body: JSON.stringify({ answers }) },
          cookie
        );
        aRes.ok
          ? pass("POST quiz attempt", `score ${attempt.score}%`)
          : fail("POST quiz attempt", attempt.error);
      } else fail("GET quiz");
    } else {
      fail("POST quizzes/generate", json.error || JSON.stringify(json));
    }
  }

  {
    const { res } = await api(`/api/courses/${courseId}/progress`, {}, cookie);
    res.ok ? pass("GET progress") : fail("GET progress");
  }

  // ── Cleanup ──
  {
    const { res } = await api(
      `/api/courses/${courseId}`,
      { method: "DELETE" },
      cookie
    );
    res.ok ? pass("DELETE course (cleanup)") : fail("DELETE course");
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFailed:");
    failed.forEach((f) => console.log(`  - ${f.name}: ${f.detail}`));
    process.exit(1);
  }
  console.log("\nAll smoke tests passed.\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

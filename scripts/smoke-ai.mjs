#!/usr/bin/env node
/** Lightweight smoke checks that don't need Supabase (usage + queue logic). */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  try {
    const raw = readFileSync(resolve(process.cwd(), ".env.local"), "utf8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i < 0) continue;
      process.env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
    }
  } catch {
    /* optional */
  }
}

loadEnvLocal();

// Dynamic import of compiled TS via tsx if available, else skip AI calls
async function main() {
  console.log("\nClarify AI smoke (local)\n");
  let ok = 0;
  let bad = 0;
  const pass = (n, d = "") => {
    ok++;
    console.log(`  ✓ ${n}${d ? ` — ${d}` : ""}`);
  };
  const fail = (n, d = "") => {
    bad++;
    console.error(`  ✗ ${n}${d ? ` — ${d}` : ""}`);
  };

  try {
    const { getUsage, recordLlmCall, recordEmbedCall, recordLlmRateLimit } =
      await import("../src/lib/ai/usage.ts");
    const { getQueueDepth } = await import("../src/lib/ai/queue.ts");

    if (process.env.GOOGLE_AI_API_KEY) {
      try {
        const { generateText, withTimeout } = await import("../src/lib/ai/gemini.ts");
        const t0 = Date.now();
        const text = await withTimeout(
          generateText("Reply with exactly the word: pong"),
          45_000,
          "generateText"
        );
        if (text.toLowerCase().includes("pong")) {
          pass("generateText", `${Date.now() - t0}ms`);
        } else fail("generateText", text.slice(0, 40));
      } catch (e) {
        fail("generateText", e.message);
      }
    } else {
      console.log("  (skip live AI — no GOOGLE_AI_API_KEY)");
    }

    recordLlmCall();
    recordLlmCall();
    recordEmbedCall();
    const u1 = getUsage();
    if (u1.minute.used >= 2) pass("usage LLM counting");
    else fail("usage LLM counting", JSON.stringify(u1.minute));

    recordLlmRateLimit(5000);
    const u2 = getUsage();
    if (u2.minute.remaining === 0 && u2.minute.blockedUntilMs > 0) {
      pass("429 syncs LLM meter to zero");
    } else fail("429 sync", JSON.stringify(u2.minute));

    const q = getQueueDepth();
    if (typeof q.llm === "number") pass("queue depth exposed", `llm=${q.llm}`);
    else fail("queue depth");
  } catch (e) {
    fail("module import", e.message);
  }

  console.log(`\n${ok}/${ok + bad} passed\n`);
  process.exit(bad ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

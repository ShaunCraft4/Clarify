# Clarify

An AI-powered learning platform that functions as a **personal learning coach**, not a chatbot. Students upload their course materials — lecture slides, PDFs, notes, and homework — and Clarify helps them study smarter through adaptive quizzes, knowledge-gap detection, flashcards, and personalized study plans.

The core differentiator: Clarify doesn't just answer questions about documents. It **tracks what you know, finds what you don't, and tells you what to study next.**

Clarify is meant to be **run on your own machine**. You use your own free Supabase project and your own Google AI key. Nothing in this repo spends anyone else's quota.

To get it running, skip to [Setup](#setup-do-these-in-order).

---

## Features

- Email/password auth (Supabase Auth) with **forgot password** (email reset link) and per-user data isolation (RLS)
- Course management — create, rename, delete; each course has its own material library
- Material upload pipeline: **Uploading → Extracting → Chunking → Embedding → Done** with live status
- **OCR for scanned PDFs** via Gemini vision when no text layer is present
- **Ask** — RAG Q&A grounded in your materials, with clickable source citations; conversations are **saved to your account** and sync across browsers/devices (delete individual messages or clear all)
- **Search** — natural-language study notes from your materials (e.g. *"Explain everything from all materials"* or *"Explain red-black trees"*)
- **Notes** — generate structured study notes from topics/subtopics and download as Markdown
- **Notes from audio** — upload a lecture recording *or* record in-app (with pause/resume) and Gemini turns the speech into organised study notes; handles full-length classes (up to 200MB / several hours), with a paste-a-transcript fallback for anything larger
- Flashcard generation + **spaced repetition** review (Again / Good / Easy) with source links
- **Export flashcards** as Markdown or Anki CSV
- Quiz generation (multiple choice / true-false / short answer), instant grading, per-topic breakdown
- **Quizzes and Exams** tab — exam readiness score, **exam simulation** (timed), **rubric upload** for grading
- Progress dashboard — topic mastery bar chart + score-over-time line chart
- Knowledge-gap detection with prerequisite recommendations
- Personalized day-by-day study plan from an exam date + hours/day
- Interactive learning dependency graph (React Flow)
- Exam prediction mode (ranked likely topics with confidence)
- **Daily study streak** saved to your account (counts once per day, syncs across browsers/devices)
- Light/dark mode, page transitions, and account deletion (sidebar)

---

## Tech Stack

- **Frontend / Backend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **Database & Vectors:** PostgreSQL + `pgvector` via Supabase
- **File storage:** Supabase Storage
- **Auth:** Supabase Auth
- **LLM:** Gemini 2.5 Flash (`gemini-2.5-flash`)
- **Embeddings:** `gemini-embedding-001` (Google), pinned to 768-dim via `outputDimensionality`
- **PDF parsing:** `pdf-parse` (+ Gemini OCR fallback)
- **Charts / Graph:** Recharts + React Flow

---

## How it works

### RAG pipeline (Ask / Search)

```
User question or search query
  → embed query (gemini-embedding-001, RETRIEVAL_QUERY)
  → match_chunks() cosine similarity over the course's chunks
  → build prompt (system persona + context + question)
  → gemini-2.5-flash
  → answer or study notes + cited source metadata
```

Search accepts natural language (not just exact keywords). Broad queries like *"explain everything from all materials"* sample across all uploads; topic queries use semantic search plus keyword fallback.

### Upload pipeline

On upload, the file is stored in Supabase Storage, then a background job:

1. Extracts text (`pdf-parse`, or Gemini OCR for scanned PDFs)
2. Splits into ~800-token overlapping chunks
3. Batch-embeds chunks with `RETRIEVAL_DOCUMENT`
4. Stores vectors in the `chunks` table (`vector(768)`)

The UI polls the material's `status` to show step-by-step progress.

### Audio notes

Recordings are sent straight to Gemini, which understands speech natively — there's no separate transcription step, so a lecture costs a single AI call.

| Recording size | How it's sent |
| --- | --- |
| Up to 12MB | Inline with the request (one round trip, best for short voice notes) |
| 12MB – 200MB | [Gemini Files API](https://ai.google.dev/gemini-api/docs/interactions/files) — uploaded, polled until processed, then referenced by URI and deleted afterwards |

Gemini accepts up to ~9.5 hours of audio per prompt, so a 3-hour class is well within range. In-app recording needs `localhost` or HTTPS (a browser requirement for microphone access).

In-app recordings are captured as **mono at 24kbps**, since Gemini downsamples everything to 16kbps mono anyway. Recording at the browser default would make uploads roughly 10x slower for no gain in accuracy — a 3-hour lecture comes out around 32MB instead of 170MB.

Long lectures work when you run Clarify **locally** (`npm run dev` / `npm start`). Serverless hosts cap request bodies far below 200MB (Vercel’s limit is **4.5 MB**). Uploads are also bound by your connection: a 200MB file on a slow uplink takes a while.

**Transcript fallback.** When a recording is too big to upload (or you already have a transcript from Zoom, Teams, or your phone), expand *"Too big to upload? Paste a transcript instead"* and paste the text — up to 500,000 characters, roughly a 6-hour lecture. It runs the same prompt as the audio path, so the notes come out identically structured, and it uploads nothing — which also sidesteps serverless request-body caps.

### Key implementation notes

- **Vector dimension is 768.** `gemini-embedding-001` uses `outputDimensionality: 768` to match the DB schema.
- **Native JSON mode** is used for structured generation (flashcards, quizzes, study plans, gap analysis, exam prediction, dependency graph).
- **Rate limiting:** an in-process queue spaces out Gemini and embedding calls to respect free-tier limits.
- **Quiz answers are never sent to the client.** Grading happens server-side.
- **Security:** user-scoped Supabase clients enforce RLS. The service-role client is used only for the background pipeline, storage cleanup, and account deletion — always after verifying ownership.

---

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start development server |
| `npm run build` | Build the app (`npm start` to run locally after build) |
| `npm run start` | Run the built app on localhost |
| `npm run lint` | ESLint |
| `npm run smoke` | Smoke test (needs Supabase env) |
| `npm run smoke:ai` | AI usage/queue smoke test (needs `GOOGLE_AI_API_KEY`) |

---

## API routes

| Method | Route | Description |
| --- | --- | --- |
| `DELETE` | `/api/account` | Delete account and all user data |
| `GET/POST` | `/api/courses` | List / create courses |
| `PATCH/DELETE` | `/api/courses/:id` | Rename / delete course |
| `GET/POST` | `/api/courses/:id/materials` | List / upload + process material |
| `DELETE` | `/api/materials/:id` | Delete a material |
| `POST` | `/api/courses/:id/ask` | RAG Q&A |
| `POST` | `/api/courses/:id/search` | Natural-language search → study notes |
| `POST` | `/api/courses/:id/notes` | Generate structured notes |
| `POST` | `/api/courses/:id/notes/audio` | Generate notes from an audio recording |
| `POST` | `/api/courses/:id/notes/transcript` | Generate notes from a pasted transcript |
| `GET/POST` | `/api/courses/:id/flashcards[/generate]` | List / generate flashcards |
| `PATCH/DELETE` | `/api/flashcards/:id` | Update mastery / delete |
| `GET/POST` | `/api/courses/:id/quizzes[/generate]` | List / generate quizzes |
| `POST` | `/api/courses/:id/quizzes/generate-exam` | Timed exam simulation |
| `GET/POST/DELETE` | `/api/courses/:id/rubric` | Course grading rubric |
| `GET` | `/api/courses/:id/exam-readiness` | Exam readiness score |
| `GET/DELETE` | `/api/quizzes/:id` | Fetch (no answers) / delete |
| `POST` | `/api/quizzes/:id/attempt` | Submit + grade attempt |
| `GET` | `/api/courses/:id/progress` | Topic mastery + history |
| `POST` | `/api/courses/:id/study-plan` | Personalized study plan |
| `POST` | `/api/courses/:id/gap-analysis` | Knowledge-gap detection |
| `POST` | `/api/courses/:id/exam-prediction` | Exam topic prediction |
| `POST` | `/api/courses/:id/dependency-graph` | Concept dependency graph |
| `POST` | `/api/courses/:id/homework-link` | Lecture-to-homework linking |
| `GET` | `/api/usage` | Internal AI usage snapshot |

---

## Project structure

```
src/
  app/
    (app)/                 # authenticated shell (sidebar)
      dashboard/           # course list
      courses/[id]/        # course workspace + tabs
    api/                   # all API routes
    login/  signup/        # auth pages
    auth/                  # password-reset callback + reset form
  components/              # Sidebar, AuthForm, ActivityProgress, …
  lib/
    ai/                    # gemini, embeddings, chunking, rate-limit queue
    supabase/              # browser / server / admin clients
    pipeline.ts            # upload → extract → chunk → embed
    retrieval.ts           # vector search + context builder
    search-query.ts        # natural-language search parsing
supabase/migrations/       # SQL schema + RLS + storage
```

---

## Security

- **Never commit** `.env.local` or real API keys to Git (already in `.gitignore`).
- **Never** put `SUPABASE_SERVICE_ROLE_KEY` or `GOOGLE_AI_API_KEY` in client-side code or `NEXT_PUBLIC_*` variables.
- Rotate keys immediately if they are accidentally exposed.

---

## Setup (do these in order)

You need about 10–15 minutes and two free accounts. Skip a step and something later will fail silently (uploads, login, or AI).

### What you need first

| Tool | Why | Get it |
| --- | --- | --- |
| **Node.js 20** (18.18+ is the minimum) | Runs the app | [nodejs.org](https://nodejs.org) — install the LTS build, then reopen the terminal |
| **Git** | Clone the repo | [git-scm.com](https://git-scm.com) |
| **A Google account** | Gemini API key | [aistudio.google.com](https://aistudio.google.com) |
| **A Supabase account** | Database, login, file storage | [supabase.com](https://supabase.com) |

Check Node is installed:

```bash
node -v
```

You should see `v20` or similar. If the command is not found, Node is not on your PATH — reinstall it and open a **new** terminal.

### 1. Clone the repo and install packages

```bash
git clone https://github.com/ShaunCraft4/Clarify.git
cd Clarify
npm install
```

Wait until `npm install` finishes without errors.

### 2. Create a Supabase project

1. Go to [supabase.com/dashboard](https://supabase.com/dashboard) and sign in.
2. **New project**.
3. Pick an org (the default personal one is fine), a name (e.g. `clarify`), a database password — **save that password**, you will not need it in `.env.local` but you cannot see it again — and a region close to you.
4. Wait until the project shows **Healthy** (usually under two minutes).

Leave this tab open. You will copy keys from it in step 6.

### 3. Run the database migrations

This creates every table, enables Row Level Security, turns on `pgvector`, and creates the private `materials` storage bucket. You do **not** create the bucket by hand.

1. In the Supabase dashboard, open **SQL Editor** (left sidebar).
2. For **each** file below, in order:
   1. Open the file in this repo.
   2. Select all, copy.
   3. In SQL Editor click **New query**, paste the whole file, click **Run**.
   4. Confirm it says success (green). Then do the next file.

| Order | File | What it adds |
| --- | --- | --- |
| 1 | [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) | Courses, materials, chunks, flashcards, quizzes, storage bucket |
| 2 | [`supabase/migrations/0002_srs_rubric_exams.sql`](supabase/migrations/0002_srs_rubric_exams.sql) | Spaced repetition, rubrics, exam simulations |
| 3 | [`supabase/migrations/0003_course_emoji.sql`](supabase/migrations/0003_course_emoji.sql) | Course emoji icons |
| 4 | [`supabase/migrations/0004_chat_messages.sql`](supabase/migrations/0004_chat_messages.sql) | Ask chat history saved to your account |
| 5 | [`supabase/migrations/0005_study_streak.sql`](supabase/migrations/0005_study_streak.sql) | Daily study streak |

**Run all five.** Skipping one leaves that table with no access policy — the UI looks fine, but saves fail (chat history is the usual victim).

If a statement errors because something “already exists”, you likely ran that file twice. That is usually harmless; continue with the next unused file.

### 4. Configure login for local use

Still in the Supabase dashboard:

**Email confirmation (do this or you will not get in)**

1. **Authentication → Providers → Email**.
2. Email/password is on by default — leave it on.
3. Turn **Confirm email** **off** for local use. Otherwise every new account sits in limbo until you click a link that may never arrive (Supabase’s built-in mail is easy to miss or land in spam).

You can turn confirmation back on later if you want. Forgot-password still works either way.

**URLs (needed for password reset)**

1. **Authentication → URL Configuration**.
2. **Site URL:** `http://localhost:3000`
3. **Redirect URLs** — add exactly:

```text
http://localhost:3000/auth/callback
```

Password-reset links go to `/auth/callback`, then `/auth/reset-password`. If this URL is missing, reset emails break.

Branded “Clarify” emails (instead of “Supabase Auth”) are optional and need SMTP. Skip them until the app runs — see [Optional: password-reset emails](#optional-password-reset-emails) below.

### 5. Create a Google AI Studio key

1. Open [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) and sign in with Google.
2. **Create API key**. A **new Google Cloud project** is easiest — Studio enables the Gemini API for you.
3. Copy the key. One key covers chat, notes, quizzes, **and** embeddings.

Free-tier quotas for `gemini-2.5-flash` are typically about **5 requests/minute** and **250/day** per project. Uploading a PDF, then immediately asking and generating flashcards, can hit the per-minute cap. Wait a minute and retry, or enable billing on that Google Cloud project for higher limits (you still get a free allowance; you only pay if you go over).

### 6. Put the secrets in `.env.local`

In the project folder, copy the example env file:

```bash
# macOS / Linux
cp .env.example .env.local

# Windows (PowerShell or Command Prompt)
copy .env.example .env.local
```

Open `.env.local` and fill in four values. **No quotes, no spaces around `=`.**

```env
GOOGLE_AI_API_KEY=your-google-ai-api-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

| Variable | Where to copy it |
| --- | --- |
| `GOOGLE_AI_API_KEY` | [AI Studio → API keys](https://aistudio.google.com/app/apikey) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → **Project Settings → API** → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page → **anon** / **public** key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page → **service_role** secret. Click **Reveal**. Server-side only — never put this in `NEXT_PUBLIC_*` or share it |

`.env.local` is gitignored. Never commit it.

If you change this file while `npm run dev` is already running, **stop it (Ctrl+C) and start it again**. Next.js only reads env vars at boot.

Optional knobs (defaults already match the Gemini free tier) live in `.env.example`:

```env
# GEMINI_RPM=5
# GEMINI_RPD=250
# GEMINI_QUEUE_MS=12000
```

### 7. Start the app

```bash
npm run dev
```

When the terminal says it is ready, open [http://localhost:3000](http://localhost:3000). You should see the login page.

To run a production-style build later (still on your machine):

```bash
npm run build
npm start
```

That still uses `.env.local`. Long audio uploads work in both `dev` and `start` locally; they fail on typical serverless hosts because those cap request bodies around **4.5 MB**.

### 8. First-time walkthrough

1. Click **Create an account**, use any email and a password of **at least 6 characters**, then log in.
2. On the dashboard, create a course (name it after a class).
3. Open the course → **Materials**. Upload a **PDF**, `.txt`, or Markdown file. Status should move **Uploading → Extracting → Chunking → Embedding → Done**.
4. When a material is **Done**, try **Ask** (“What is this lecture about?”) or **Notes**.

If upload sits on **error**, or Ask says it has no materials, see [Troubleshooting](#troubleshooting).

### Optional: password-reset emails

Clarify’s login page has **Forgot password?**. Supabase sends the email — you do not configure extra env vars.

- **Default:** it already works with Supabase’s built-in mail. The message will say “Supabase Auth”. Check spam.
- **Branded Clarify emails:** you must attach **custom SMTP** first (Resend’s free tier is enough), then paste the HTML templates. Full walkthrough: [`supabase/email-templates/README.md`](supabase/email-templates/README.md).

Flow:

```
Forgot password? → enter email
  → Supabase sends a link
  → /auth/callback → /auth/reset-password
  → new password → dashboard
```

---

## Troubleshooting

| What you see | Likely cause | Fix |
| --- | --- | --- |
| Sign-up succeeds but you cannot log in | **Confirm email** is still on | Auth → Providers → Email → turn Confirm email **off**, or open the confirm link in your inbox/spam |
| Login page loads unstyled / buttons do nothing | Dev server not running, or you opened the wrong port | Use the URL printed by `npm run dev` (usually `http://localhost:3000`) |
| “Invalid API key” / app crashes on AI actions | Missing or truncated `GOOGLE_AI_API_KEY` | Paste the full key into `.env.local`, restart `npm run dev` |
| Upload fails / `Upload failed` | Wrong `SUPABASE_SERVICE_ROLE_KEY`, or migration 0001 not run (no `materials` bucket) | Re-copy the **service_role** key; re-run `0001_init.sql` |
| Materials never leave `pending` / `error` | Gemini key missing, or free-tier quota hit | Check `.env.local`, wait a minute, retry. Look at the terminal running `npm run dev` for the error |
| Ask / notes work, but chat vanishes after refresh | Migration `0004` not applied, or its RLS policy missing | Run [`0004_chat_messages.sql`](supabase/migrations/0004_chat_messages.sql) in SQL Editor |
| `429` / “rate limit” / “quota” from Gemini | Free tier (~5/min, ~250/day) | Wait; space out generations. Optional: enable billing on that Google Cloud project |
| Microphone button errors | Browser blocks mic on non-secure origins | Use `http://localhost:3000` (localhost is allowed). `file://` or a LAN IP without HTTPS will not |
| Password reset link errors | Redirect URL not allow-listed | Add `http://localhost:3000/auth/callback` under Auth → URL Configuration |
| Changed `.env.local` but nothing changed | Next.js does not hot-reload env | Stop the server and run `npm run dev` again |

---

## License

Copyright (c) 2026 Shaun Kareparambil Shelly. All rights reserved unless granted below.

Clarify is licensed under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0). See [LICENSE](./LICENSE) for the full text.

**In short:** you may download, use, modify, and share Clarify for **noncommercial** purposes (personal use, study, hobby projects, etc.). You may **not** sell it, offer it as a paid service, or use it for other commercial purposes.

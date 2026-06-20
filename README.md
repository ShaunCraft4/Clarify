# Clarify

An AI-powered learning platform that functions as a **personal learning coach**, not a chatbot. Students upload their course materials — lecture slides, PDFs, notes, and homework — and Clarify helps them study smarter through adaptive quizzes, knowledge-gap detection, flashcards, and personalized study plans.

The core differentiator: Clarify doesn't just answer questions about documents. It **tracks what you know, finds what you don't, and tells you what to study next.**

---

## Self-hosting (read this first)

Clarify is designed to be **run by each person on their own machine** (or their own Supabase + Vercel project). Every installation uses **your own** credentials:

- **Your** Supabase project (database, auth, file storage)
- **Your** Google AI Studio API key (Gemini + embeddings)

You are **not** using the repo maintainer's API quota. Keys live in `.env.local` on the server — they are never committed to Git and are not shared between users unless you deliberately deploy one shared instance (not recommended).

> **Do not** publish a public demo with a single shared `GOOGLE_AI_API_KEY`. Free-tier limits are per Google project (~5 text requests/min, ~250/day). One key for many users will hit rate limits quickly. If you host for others, enable billing on your Google AI project and add your own usage controls.

---

## Features

- Email/password auth (Supabase Auth) with per-user data isolation (RLS)
- Course management — create, rename, delete; each course has its own material library
- Material upload pipeline: **Uploading → Extracting → Chunking → Embedding → Done** with live status
- **OCR for scanned PDFs** via Gemini vision when no text layer is present
- **Ask** — RAG Q&A grounded in your materials, with clickable source citations; chat persists until you clear it
- **Search** — natural-language study notes from your materials (e.g. *"Explain everything from all materials"* or *"Explain red-black trees"*)
- **Notes** — generate structured study notes from topics/subtopics and download as Markdown
- Flashcard generation + **spaced repetition** review (Again / Good / Easy) with source links
- **Export flashcards** as Markdown or Anki CSV
- Quiz generation (multiple choice / true-false / short answer), instant grading, per-topic breakdown
- **Quizzes and Exams** tab — exam readiness score, **exam simulation** (timed), **rubric upload** for grading
- Progress dashboard — topic mastery bar chart + score-over-time line chart
- Knowledge-gap detection with prerequisite recommendations
- Personalized day-by-day study plan from an exam date + hours/day
- Interactive learning dependency graph (React Flow)
- Exam prediction mode (ranked likely topics with confidence)
- Dark mode, page transitions, and account deletion (sidebar)

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

## Setup

### 1. Clone and install

```bash
git clone https://github.com/YOUR_USERNAME/Clarify.git
cd Clarify
npm install
```

### 2. Configure Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the **SQL Editor**, run the migrations in order:
   - [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql) — core schema
   - [`supabase/migrations/0002_srs_rubric_exams.sql`](supabase/migrations/0002_srs_rubric_exams.sql) — spaced repetition, rubrics, exam simulations
3. Under **Authentication → Providers**, email/password is enabled by default. For local testing you may want to disable **Confirm email** so new sign-ups log in immediately.

### 3. Get a Google AI key

1. Go to [Google AI Studio](https://aistudio.google.com/app/apikey).
2. Create an API key (a **new project** is easiest — it auto-enables the Gemini API).
3. The same key covers both Gemini text generation and embeddings.

**Free tier limits** (typical for `gemini-2.5-flash`): about **5 requests/min** and **250 requests/day** per project. Heavy use (uploads + search + ask in quick succession) will hit these limits. Enable billing on your Google AI project for higher quotas — you still get free allowance; you only pay if you exceed it.

### 4. Environment variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

```env
GOOGLE_AI_API_KEY=your-google-ai-api-key
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

| Variable | Where to find it |
| --- | --- |
| `GOOGLE_AI_API_KEY` | [AI Studio → API keys](https://aistudio.google.com/app/apikey) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → **Project Settings → API** |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page, `anon` public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page, `service_role` secret — **server-side only**, never expose to the browser |

Optional tuning (see `.env.example`):

```env
# GEMINI_RPM=5
# GEMINI_RPD=250
# GEMINI_QUEUE_MS=12000
```

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up, create a course, and upload a PDF.

### 6. Production build (optional)

```bash
npm run build
npm start
```

The upload pipeline runs as a background task in the request process. This works on a long-lived Node server. On purely serverless platforms, long PDF processing may be cut off after the response — consider a queue/worker for production at scale.

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
| `npm run build` | Production build |
| `npm run start` | Run production server |
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

## License

Add your license here (e.g. MIT) before publishing to GitHub.

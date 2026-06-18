# Clarify

An AI-powered learning platform that functions as a **personal learning coach**, not a chatbot. Students upload their course materials — lecture slides, PDFs, notes, and homework — and Clarify helps them study smarter through adaptive quizzes, knowledge-gap detection, flashcards, and personalized study plans.

The core differentiator: Clarify doesn't just answer questions about documents. It **tracks what you know, finds what you don't, and tells you what to study next.**

---

## Features

**Phase 1 — MVP**
- Email/password auth (Supabase Auth) with per-user data isolation (RLS)
- Course management — create, rename, delete; each course has its own material library
- Material upload pipeline: **Uploading → Extracting → Chunking → Embedding → Done** with live status
- RAG Q&A grounded in your materials, with clickable source citations
- Semantic search across a course, grouped by material with highlighted excerpts
- Flashcard generation + review mode (flip animation, keyboard shortcuts, mastery tracking)
- Quiz generation (multiple choice / true-false / short answer), instant grading, per-topic breakdown
- Progress dashboard — topic mastery bar chart (color-coded) + score-over-time line chart

**Phase 2 — Standout**
- Knowledge-gap detection (unlocks after 2+ quizzes) with prerequisite recommendations
- Personalized day-by-day study plan from an exam date + hours/day
- Lecture-to-homework linking (each homework chunk → most relevant lecture passages)
- Misconception detection (corrections highlighted in the chat)

**Phase 3 — Recruiter-wow**
- Interactive learning dependency graph (react-flow DAG, nodes colored by mastery)
- Exam prediction mode (ranked likely topics with confidence)
- Socratic tutor mode (guiding questions instead of answers)

---

## Tech Stack

- **Frontend / Backend:** Next.js 15 (App Router) + TypeScript + Tailwind CSS
- **Database & Vectors:** PostgreSQL + `pgvector` via Supabase
- **File storage:** Supabase Storage
- **Auth:** Supabase Auth
- **LLM:** Gemini 2.0 Flash (`gemini-2.0-flash`)
- **Embeddings:** `gemini-embedding-001` (Google), pinned to 768-dim via `outputDimensionality`
- **PDF parsing:** `pdf-parse`
- **Charts / Graph:** Recharts + React Flow

All AI features run on a single free-tier Google AI Studio key.

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. In the SQL Editor, run the migration in [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql). This creates all tables, the `pgvector` extension, the `match_chunks` similarity-search function, Row Level Security policies, and the private `materials` storage bucket.
3. (Auth) Under **Authentication → Providers**, email/password is enabled by default. For local testing you may want to disable "Confirm email" so new sign-ups log in immediately.

### 3. Get a Google AI key

Create a free key at [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) — the "Create API key in a new project" option is easiest, as it auto-enables the Gemini API. The same key covers both Gemini and the embedding model.

### 4. Environment variables

Copy `.env.example` to `.env.local` and fill in:

```env
GOOGLE_AI_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — from **Project Settings → API**.
- `SUPABASE_SERVICE_ROLE_KEY` — same page, **service_role** secret. Server-side only; never exposed to the browser.

### 5. Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000), sign up, create a course, and upload a PDF.

---

## How it works

### RAG pipeline

```
User question
  → embed query (gemini-embedding-001, RETRIEVAL_QUERY)
  → match_chunks() cosine similarity over the course's chunks (top-5)
  → build prompt (system persona + context + question)
  → gemini-2.0-flash
  → answer + cited source metadata
```

### Upload pipeline

On upload, the file is stored in Supabase Storage, then a background job extracts text, splits it into ~400-token overlapping chunks (50-token overlap), embeds each chunk with `RETRIEVAL_DOCUMENT`, and stores them in the `chunks` table (`vector(768)`). The UI polls the material's `status` to show step-by-step progress.

### Key implementation notes

- **Vector dimension is 768.** `gemini-embedding-001` is requested with `outputDimensionality: 768` to match the `chunks.embedding` `vector(768)` column.
- **Native JSON mode** (`responseMimeType: "application/json"`) is used for all structured generation (flashcards, quizzes, study plans, gap analysis, exam prediction, dependency graph).
- **Embedding task types** are split correctly: `RETRIEVAL_DOCUMENT` at upload, `RETRIEVAL_QUERY` at search/ask.
- **Topic taxonomy** is required on every quiz question and flashcard — this powers mastery tracking and gap detection.
- **Rate limiting:** a small in-process queue spaces out Gemini calls (~15 req/min) and embedding calls to respect free-tier limits during batch embedding.
- **Quiz answers are never sent to the client.** Questions are served without `correct_answer`; grading happens server-side in the attempt route.
- **Security:** all reads/writes use a user-scoped Supabase client so RLS enforces per-user isolation. The service-role client is used only for the background pipeline and storage cleanup, always after verifying ownership.

---

## API routes

| Method | Route | Description |
| --- | --- | --- |
| `GET/POST` | `/api/courses` | List / create courses |
| `PATCH/DELETE` | `/api/courses/:id` | Rename / delete course |
| `GET/POST` | `/api/courses/:id/materials` | List / upload + process material |
| `DELETE` | `/api/materials/:id` | Delete a material |
| `POST` | `/api/courses/:id/ask` | RAG Q&A (answer / tutor mode) |
| `POST` | `/api/courses/:id/search` | Semantic search |
| `GET/POST` | `/api/courses/:id/flashcards[/generate]` | List / generate flashcards |
| `PATCH/DELETE` | `/api/flashcards/:id` | Update mastery / delete |
| `GET/POST` | `/api/courses/:id/quizzes[/generate]` | List / generate quizzes |
| `GET/DELETE` | `/api/quizzes/:id` | Fetch (no answers) / delete |
| `POST` | `/api/quizzes/:id/attempt` | Submit + grade attempt |
| `GET` | `/api/courses/:id/progress` | Topic mastery + history |
| `POST` | `/api/courses/:id/study-plan` | Personalized study plan |
| `POST` | `/api/courses/:id/gap-analysis` | Knowledge-gap detection |
| `POST` | `/api/courses/:id/exam-prediction` | Exam topic prediction |
| `POST` | `/api/courses/:id/dependency-graph` | Concept dependency graph |
| `POST` | `/api/courses/:id/homework-link` | Lecture-to-homework linking |

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
    middleware.ts          # session refresh + route protection
  components/              # Sidebar, AuthForm, DependencyGraphView
  lib/
    ai/                    # gemini, embeddings, chunking, rate-limit queue
    supabase/              # browser / server / admin clients
    pipeline.ts            # upload → extract → chunk → embed
    retrieval.ts           # vector search + context builder
    mastery.ts             # quiz grading + topic mastery updates
    content.ts             # gather chunk content for generation
supabase/migrations/       # SQL schema + RLS + storage
```

> **Deployment note:** the upload pipeline runs as a background task in the request process, which works on a long-lived Node server (`npm run build && npm start`). On purely serverless platforms you may want to move it to a queue/worker so processing isn't cut off after the response.

# Clarify

An AI-powered learning platform that functions as a **personal learning coach**, not a chatbot. Students upload their course materials — lecture slides, PDFs, notes, and homework — and Clarify helps them study smarter through adaptive quizzes, knowledge-gap detection, flashcards, and personalized study plans.

The core differentiator: Clarify doesn't just answer questions about documents. It **tracks what you know, finds what you don't, and tells you what to study next.**

---

## Live demo (for recruiters)

Want to try Clarify without setting anything up? A hosted demo with a pre-loaded sample course is available:

**▶ [clarify-nu.vercel.app](https://clarify-nu.vercel.app)**

| | |
| --- | --- |
| **Email** | `clarify.demo@gmail.com` |
| **Password** | `clarifydemo` |

Just **log in** with the credentials above (no need to sign up). This shared account is for evaluation only — please don't store anything sensitive in it.

> Running your own copy is easy and only takes a few minutes — see [Setup](#setup) below.

---

## Self-hosting (read this first)

Clarify is designed to be **run locally on your own machine**. Every installation uses **your own** credentials:

- **Your** Supabase project (database, auth, file storage)
- **Your** Google AI Studio API key (Gemini + embeddings)

You are **not** using the repo maintainer's API quota. Keys live in `.env.local` on your machine — they are never committed to Git and are not shared with other users.

---

## Features

- Email/password auth (Supabase Auth) with **forgot password** (email reset link) and per-user data isolation (RLS)
- Course management — create, rename, delete; each course has its own material library
- Material upload pipeline: **Uploading → Extracting → Chunking → Embedding → Done** with live status
- **OCR for scanned PDFs** via Gemini vision when no text layer is present
- **Ask** — RAG Q&A grounded in your materials, with clickable source citations; conversations are **saved to your account** and sync across browsers/devices (delete individual messages or clear all)
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
   - [`supabase/migrations/0003_course_emoji.sql`](supabase/migrations/0003_course_emoji.sql) — optional course emoji icons
   - [`supabase/migrations/0004_chat_messages.sql`](supabase/migrations/0004_chat_messages.sql) — Ask chat history saved to your account
   - [`supabase/migrations/0005_study_streak.sql`](supabase/migrations/0005_study_streak.sql) — daily study streak saved to your account

   **Run all of them** — each migration enables Row Level Security and its policy. Skipping a migration leaves that feature's table inaccessible (writes silently fail).
3. Under **Authentication → Providers**, email/password is enabled by default. For local testing you may want to disable **Confirm email** so new sign-ups log in immediately.
4. Configure **auth URLs and email** for login and password reset — see [Auth & password reset](#auth--password-reset) below.

### Auth & password reset

Clarify’s login page includes **Forgot password?** Users enter their email, Supabase sends a reset link, and they set a new password at `/auth/reset-password`. **You do not handle resets manually** — Supabase Auth sends the email.

Each self-hoster configures this **once** in their own Supabase project (same place as signup email).

#### 1. Site URL

Supabase → **Authentication → URL Configuration → Site URL**

| Environment | Site URL |
| --- | --- |
| Local dev | `http://localhost:3000` |

#### 2. Redirect URLs

On the same page, add these to **Redirect URLs** (one per line):

```text
http://localhost:3000/auth/callback
```

Password reset links go through `/auth/callback` and then to `/auth/reset-password`. If this URL is missing, reset emails will fail or redirect to an error page.

#### 3. Email delivery

Supabase sends signup and password-reset emails for you.

| Setup | Good for |
| --- | --- |
| **Supabase built-in email** (default) | Local testing, personal/small self-hosted installs |
| **Custom SMTP** (Supabase → Authentication → Email → SMTP) | Optional — better deliverability if built-in email is unreliable |

For custom SMTP, use a provider such as Resend, SendGrid, or Gmail app password. Without working email, **Forgot password** (and signup confirmation, if enabled) will not reach users.

#### 4. Branded emails (Clarify instead of Supabase)

By default, reset emails say **Supabase Auth** and include a “powered by Supabase” footer.

**Where:** Supabase → **Authentication → Emails** → **Templates** tab (not Project Settings).

**Catch:** Supabase requires **custom SMTP** before templates are editable. If you see *“Set up custom SMTP to edit templates”*, go to the **SMTP Settings** tab first, connect a provider (Resend, Gmail, etc.), then return to **Templates**.

After SMTP is on:

1. Click **Reset password**
2. Subject: `Reset your Clarify password`
3. Paste HTML from [`supabase/email-templates/recovery.html`](supabase/email-templates/recovery.html)
4. Set sender name to **Clarify** in SMTP settings

Optional: **Confirm sign up** template using [`confirmation.html`](supabase/email-templates/confirmation.html).

Step-by-step (including free Resend setup): [`supabase/email-templates/README.md`](supabase/email-templates/README.md).

**No SMTP?** Forgot password still works — users just get Supabase’s default email. Branding is optional.

#### Flow (for reference)

```
User clicks "Forgot password?" → enters email
  → Supabase sends reset link
  → user clicks link → /auth/callback → /auth/reset-password
  → user sets new password → dashboard
```

No extra env vars or Clarify code changes are required beyond normal Supabase setup.

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

## License

Copyright (c) 2026 Shaun Kareparambil Shelly. All rights reserved unless granted below.

Clarify is licensed under the [PolyForm Noncommercial License 1.0.0](https://polyformproject.org/licenses/noncommercial/1.0.0). See [LICENSE](./LICENSE) for the full text.

**In short:** you may download, use, modify, and share Clarify for **noncommercial** purposes (personal use, study, hobby projects, etc.). You may **not** sell it, offer it as a paid service, or use it for other commercial purposes.

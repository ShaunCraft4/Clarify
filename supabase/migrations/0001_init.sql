-- Clarify — initial schema
-- Run this in the Supabase SQL editor (or via the Supabase CLI).

-- ── Extensions ────────────────────────────────────────────────────────────
create extension if not exists "uuid-ossp";
create extension if not exists vector;

-- ── Courses ───────────────────────────────────────────────────────────────
create table if not exists public.courses (
  id          uuid primary key default uuid_generate_v4(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  name        text not null,
  description text,
  created_at  timestamptz not null default now()
);

-- ── Materials ─────────────────────────────────────────────────────────────
create table if not exists public.materials (
  id             uuid primary key default uuid_generate_v4(),
  course_id      uuid not null references public.courses (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  file_name      text not null,
  file_type      text not null check (file_type in ('pdf','slides','notes','homework')),
  storage_path   text,
  extracted_text text default '',
  chunk_count    integer not null default 0,
  status         text not null default 'pending'
                 check (status in ('pending','extracting','chunking','embedding','done','error')),
  error          text,
  uploaded_at    timestamptz not null default now()
);

-- ── Chunks (RAG) ──────────────────────────────────────────────────────────
create table if not exists public.chunks (
  id          uuid primary key default uuid_generate_v4(),
  material_id uuid not null references public.materials (id) on delete cascade,
  course_id   uuid not null references public.courses (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  content     text not null,
  embedding   vector(768),
  chunk_index integer not null default 0,
  metadata    jsonb not null default '{}'::jsonb
);

create index if not exists chunks_embedding_idx
  on public.chunks using hnsw (embedding vector_cosine_ops);
create index if not exists chunks_course_idx on public.chunks (course_id);

-- ── Flashcards ────────────────────────────────────────────────────────────
create table if not exists public.flashcards (
  id              uuid primary key default uuid_generate_v4(),
  course_id       uuid not null references public.courses (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  question        text not null,
  answer          text not null,
  topic           text,
  source_chunk_id uuid references public.chunks (id) on delete set null,
  mastered_at     timestamptz,
  review_count    integer not null default 0,
  last_reviewed_at timestamptz,
  created_at      timestamptz not null default now()
);

-- ── Quizzes ───────────────────────────────────────────────────────────────
create table if not exists public.quizzes (
  id         uuid primary key default uuid_generate_v4(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  title      text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.quiz_questions (
  id             uuid primary key default uuid_generate_v4(),
  quiz_id        uuid not null references public.quizzes (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  type           text not null check (type in ('multiple_choice','short_answer','true_false')),
  question       text not null,
  options        jsonb,
  correct_answer text not null,
  topic          text not null default 'General',
  source_chunk_id uuid references public.chunks (id) on delete set null,
  position       integer not null default 0
);

-- ── Quiz attempts ─────────────────────────────────────────────────────────
create table if not exists public.quiz_attempts (
  id              uuid primary key default uuid_generate_v4(),
  quiz_id         uuid not null references public.quizzes (id) on delete cascade,
  course_id       uuid not null references public.courses (id) on delete cascade,
  user_id         uuid not null references auth.users (id) on delete cascade,
  answers         jsonb not null default '[]'::jsonb,
  score           numeric not null default 0,
  topic_breakdown jsonb not null default '[]'::jsonb,
  completed_at    timestamptz not null default now()
);

-- ── Topic mastery ─────────────────────────────────────────────────────────
create table if not exists public.topic_mastery (
  id             uuid primary key default uuid_generate_v4(),
  user_id        uuid not null references auth.users (id) on delete cascade,
  course_id      uuid not null references public.courses (id) on delete cascade,
  topic          text not null,
  mastery_score  numeric not null default 0,
  attempts_count integer not null default 0,
  last_updated_at timestamptz not null default now(),
  unique (course_id, topic)
);

-- ── Vector search RPC (cosine similarity, top-k) ──────────────────────────
create or replace function public.match_chunks (
  p_course_id     uuid,
  query_embedding vector(768),
  match_count     int default 5
)
returns table (
  id          uuid,
  material_id uuid,
  content     text,
  chunk_index integer,
  metadata    jsonb,
  similarity  float
)
language sql
stable
security invoker
as $$
  select
    c.id,
    c.material_id,
    c.content,
    c.chunk_index,
    c.metadata,
    1 - (c.embedding <=> query_embedding) as similarity
  from public.chunks c
  where c.course_id = p_course_id
    and c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- ── Row Level Security ────────────────────────────────────────────────────
alter table public.courses        enable row level security;
alter table public.materials      enable row level security;
alter table public.chunks         enable row level security;
alter table public.flashcards     enable row level security;
alter table public.quizzes        enable row level security;
alter table public.quiz_questions enable row level security;
alter table public.quiz_attempts  enable row level security;
alter table public.topic_mastery  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'courses','materials','chunks','flashcards','quizzes',
    'quiz_questions','quiz_attempts','topic_mastery'
  ]
  loop
    execute format('drop policy if exists "owner_all" on public.%I;', t);
    execute format(
      'create policy "owner_all" on public.%I
         for all using (auth.uid() = user_id)
         with check (auth.uid() = user_id);', t);
  end loop;
end $$;

-- ── Storage bucket for uploaded materials ─────────────────────────────────
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false)
on conflict (id) do nothing;

drop policy if exists "materials_owner_select" on storage.objects;
drop policy if exists "materials_owner_insert" on storage.objects;
drop policy if exists "materials_owner_delete" on storage.objects;

-- Files are stored under "<user_id>/<course_id>/<file>" so the first path
-- segment is the owner's id.
create policy "materials_owner_select" on storage.objects
  for select using (
    bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "materials_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "materials_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'materials' and (storage.foldername(name))[1] = auth.uid()::text
  );

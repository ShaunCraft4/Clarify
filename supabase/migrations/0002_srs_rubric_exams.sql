-- SRS fields for flashcards
alter table public.flashcards
  add column if not exists ease_factor numeric not null default 2.5,
  add column if not exists interval_days integer not null default 0,
  add column if not exists due_at timestamptz not null default now();

create index if not exists flashcards_due_idx on public.flashcards (course_id, due_at);

-- One grading rubric per course (uploaded PDF/text)
create table if not exists public.course_rubrics (
  id             uuid primary key default uuid_generate_v4(),
  course_id      uuid not null references public.courses (id) on delete cascade,
  user_id        uuid not null references auth.users (id) on delete cascade,
  file_name      text not null,
  storage_path   text,
  extracted_text text not null default '',
  uploaded_at    timestamptz not null default now(),
  unique (course_id)
);

alter table public.course_rubrics enable row level security;

drop policy if exists "owner_all" on public.course_rubrics;
create policy "owner_all" on public.course_rubrics
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Exam simulation metadata on quizzes
alter table public.quizzes
  add column if not exists is_exam_sim boolean not null default false,
  add column if not exists time_limit_minutes integer;

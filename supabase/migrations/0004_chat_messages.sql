-- Clarify — Ask chat history persisted per user + course
-- Run this in the Supabase SQL editor (or via the Supabase CLI).

create table if not exists public.chat_messages (
  id         uuid primary key default uuid_generate_v4(),
  course_id  uuid not null references public.courses (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('user','assistant')),
  content    text not null,
  citations  jsonb not null default '[]'::jsonb,
  seq        bigint generated always as identity,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_course_idx
  on public.chat_messages (course_id, seq);

alter table public.chat_messages enable row level security;

drop policy if exists "owner_all" on public.chat_messages;
create policy "owner_all" on public.chat_messages
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

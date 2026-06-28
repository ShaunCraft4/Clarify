-- Clarify — daily study streak persisted per account
-- Run this in the Supabase SQL editor (or via the Supabase CLI).

create table if not exists public.study_streak (
  user_id         uuid primary key references auth.users (id) on delete cascade,
  streak          integer not null default 0,
  last_study_date date,
  updated_at      timestamptz not null default now()
);

alter table public.study_streak enable row level security;

drop policy if exists "owner_all" on public.study_streak;
create policy "owner_all" on public.study_streak
  for all using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

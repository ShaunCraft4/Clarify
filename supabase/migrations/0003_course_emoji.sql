-- Optional emoji icon per course (often AI-generated from the course name)
alter table public.courses
  add column if not exists emoji text;

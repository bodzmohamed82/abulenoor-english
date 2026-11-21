-- Osama Abulenoor IGCSE English platform — Supabase schema
-- Run once in the Supabase SQL editor of the project.

-- Teacher registry (the one admin account)
create table if not exists public.teachers (
  id uuid primary key references auth.users(id) on delete cascade
);

create or replace function public.is_teacher() returns boolean
language sql stable security definer set search_path = public as
$$ select exists (select 1 from public.teachers where id = auth.uid()) $$;

-- Student profiles; auth rows are created by scripts/create-students.mjs
create table if not exists public.students (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  full_name text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.assignments (
  id bigint generated always as identity primary key,
  title text not null,
  description text not null default '',
  file_path text,                 -- path in storage bucket 'assignments'
  due_date date,
  created_at timestamptz not null default now()
);

create table if not exists public.submissions (
  id bigint generated always as identity primary key,
  assignment_id bigint not null references public.assignments(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  file_path text not null default '', -- path in storage bucket 'submissions'
  note text not null default '',
  submitted_at timestamptz not null default now(),
  unique (assignment_id, student_id)
);

create table if not exists public.quiz_grades (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  quiz_name text not null,
  score numeric not null,
  max_score numeric not null default 10,
  graded_at date not null default current_date
);

alter table public.teachers    enable row level security;
alter table public.students    enable row level security;
alter table public.assignments enable row level security;
alter table public.submissions enable row level security;
alter table public.quiz_grades enable row level security;

-- students: a student reads only their own row; the teacher reads all
-- teacher can read their own registry row (frontend role check)
create policy teachers_select on public.teachers for select to authenticated
  using (id = auth.uid());
create policy students_select on public.students for select to authenticated
  using (id = auth.uid() or public.is_teacher());

-- assignments: every signed-in user reads; only the teacher writes
create policy assignments_select on public.assignments for select to authenticated using (true);
create policy assignments_write  on public.assignments for all    to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- submissions: a student inserts/reads their own; the teacher reads all
create policy submissions_insert on public.submissions for insert to authenticated
  with check (student_id = auth.uid());
create policy submissions_select on public.submissions for select to authenticated
  using (student_id = auth.uid() or public.is_teacher());

-- quiz grades: a student reads only their own; the teacher writes
create policy grades_select on public.quiz_grades for select to authenticated
  using (student_id = auth.uid() or public.is_teacher());
create policy grades_write  on public.quiz_grades for all to authenticated
  using (public.is_teacher()) with check (public.is_teacher());

-- Private file buckets
insert into storage.buckets (id, name, public) values ('assignments', 'assignments', false) on conflict do nothing;
insert into storage.buckets (id, name, public) values ('submissions', 'submissions', false) on conflict do nothing;

-- assignments files: read by any signed-in user, written by the teacher
create policy assignments_files_read on storage.objects for select to authenticated
  using (bucket_id = 'assignments');
create policy assignments_files_write on storage.objects for insert to authenticated
  with check (bucket_id = 'assignments' and public.is_teacher());

-- submission files: student writes/reads inside their own id folder; teacher reads all
create policy submissions_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'submissions' and (storage.foldername(name))[1] = auth.uid()::text);
create policy submissions_files_read on storage.objects for select to authenticated
  using (bucket_id = 'submissions' and ((storage.foldername(name))[1] = auth.uid()::text or public.is_teacher()));

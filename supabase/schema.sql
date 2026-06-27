-- ════════════════════════════════════════════════════════════════
-- ProjecTrack · Supabase Database Schema
-- Run this SQL in your Supabase project's SQL Editor.
-- ════════════════════════════════════════════════════════════════

-- ─── Auto-create profile on sign-up (runs server-side, bypasses RLS) ────────

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, supervisor_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', 'New User'),
    coalesce(new.raw_user_meta_data ->> 'role', 'student'),
    null
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ─── Tables ──────────────────────────────────────────────────────

create table if not exists public.profiles (
  id           uuid references auth.users on delete cascade primary key,
  full_name    text        not null,
  role         text        not null check (role in ('student', 'supervisor', 'admin')),
  supervisor_id uuid references public.profiles(id) on delete set null,
  created_at   timestamptz default now()
);

create table if not exists public.projects (
  id            uuid default gen_random_uuid() primary key,
  student_id    uuid references public.profiles(id) on delete cascade  not null,
  supervisor_id uuid references public.profiles(id) on delete set null,
  title         text        not null,
  status        text        not null default 'proposed'
                check (status in ('proposed', 'approved', 'rejected')),
  created_at    timestamptz default now()
);

create table if not exists public.submissions (
  id              uuid default gen_random_uuid() primary key,
  project_id      uuid references public.projects(id) on delete cascade   not null,
  student_id      uuid references public.profiles(id) on delete cascade   not null,
  supervisor_id   uuid references public.profiles(id) on delete set null,
  chapter_title   text        not null,
  file_path       text,
  status          text        not null default 'pending'
                  check (status in ('pending', 'approved', 'rejected')),
  submission_date timestamptz default now()
);

create table if not exists public.feedback (
  id            uuid default gen_random_uuid() primary key,
  submission_id uuid references public.submissions(id) on delete cascade not null,
  supervisor_id uuid references public.profiles(id)   on delete set null not null,
  comments      text        not null,
  feedback_date timestamptz default now()
);

create table if not exists public.notifications (
  id         uuid default gen_random_uuid() primary key,
  user_id    uuid references public.profiles(id) on delete cascade not null,
  message    text        not null,
  is_read    boolean     not null default false,
  created_at timestamptz default now()
);

-- ─── Row Level Security ───────────────────────────────────────────

alter table public.profiles      enable row level security;
alter table public.projects      enable row level security;
alter table public.submissions   enable row level security;
alter table public.feedback      enable row level security;
alter table public.notifications enable row level security;

-- NOTE: Admin check uses JWT user_metadata (set during sign-up via options.data.role)
-- to avoid recursive RLS queries on the profiles table itself.

-- ── profiles ──────────────────────────────────────────────────────
create policy "profiles: own read"
  on public.profiles for select to authenticated
  using (auth.uid() = id);

create policy "profiles: supervisor sees assigned students"
  on public.profiles for select to authenticated
  using (supervisor_id = auth.uid());

create policy "profiles: admin sees all"
  on public.profiles for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy "profiles: own insert"
  on public.profiles for insert to authenticated
  with check (auth.uid() = id);

create policy "profiles: own update"
  on public.profiles for update to authenticated
  using (auth.uid() = id);

create policy "profiles: admin update all"
  on public.profiles for update to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- ── projects ──────────────────────────────────────────────────────
create policy "projects: student sees own"
  on public.projects for select to authenticated
  using (student_id = auth.uid());

create policy "projects: supervisor sees assigned"
  on public.projects for select to authenticated
  using (supervisor_id = auth.uid());

create policy "projects: admin sees all"
  on public.projects for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy "projects: student insert"
  on public.projects for insert to authenticated
  with check (student_id = auth.uid());

create policy "projects: supervisor update status"
  on public.projects for update to authenticated
  using (supervisor_id = auth.uid());

create policy "projects: admin update all"
  on public.projects for update to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- ── submissions ───────────────────────────────────────────────────
create policy "submissions: student sees own"
  on public.submissions for select to authenticated
  using (student_id = auth.uid());

create policy "submissions: supervisor sees assigned"
  on public.submissions for select to authenticated
  using (supervisor_id = auth.uid());

create policy "submissions: admin sees all"
  on public.submissions for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy "submissions: student insert"
  on public.submissions for insert to authenticated
  with check (student_id = auth.uid());

create policy "submissions: supervisor update status"
  on public.submissions for update to authenticated
  using (supervisor_id = auth.uid());

create policy "submissions: admin update all"
  on public.submissions for update to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

-- ── feedback ──────────────────────────────────────────────────────
create policy "feedback: student reads feedback on own submissions"
  on public.feedback for select to authenticated
  using (
    exists (
      select 1 from public.submissions
      where id = feedback.submission_id and student_id = auth.uid()
    )
  );

create policy "feedback: supervisor reads own feedback"
  on public.feedback for select to authenticated
  using (supervisor_id = auth.uid());

create policy "feedback: admin sees all"
  on public.feedback for select to authenticated
  using ((auth.jwt() -> 'user_metadata' ->> 'role') = 'admin');

create policy "feedback: supervisor insert"
  on public.feedback for insert to authenticated
  with check (supervisor_id = auth.uid());

-- ── notifications ─────────────────────────────────────────────────
create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

create policy "notifications: update own (mark read)"
  on public.notifications for update to authenticated
  using (user_id = auth.uid());

create policy "notifications: any authenticated user may create"
  on public.notifications for insert to authenticated
  with check (true);

-- ─── Storage ─────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'submissions',
  'submissions',
  false,
  10485760,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword'
  ]
)
on conflict (id) do nothing;

create policy "submissions storage: student upload to own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'submissions'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "submissions storage: authenticated read"
  on storage.objects for select to authenticated
  using (bucket_id = 'submissions');

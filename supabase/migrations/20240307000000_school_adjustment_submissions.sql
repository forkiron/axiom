-- School adjustment factor submissions from the AI Test Analyzer.
-- Multiple submissions per school are aggregated as a weighted average (see API).
create table if not exists public.school_adjustment_submissions (
  id uuid primary key default gen_random_uuid(),
  school_id text not null,
  adjustment_factor numeric not null,
  weight numeric not null default 1,
  created_at timestamptz not null default now()
);

create index if not exists idx_school_adjustment_submissions_school_id
  on public.school_adjustment_submissions (school_id);

-- Allow anonymous read for public map; use RLS and service role for writes from API.
alter table public.school_adjustment_submissions enable row level security;

-- Anyone can read (so the map can show adjustment factors for all schools)
drop policy if exists "Allow public read" on public.school_adjustment_submissions;
create policy "Allow public read"
  on public.school_adjustment_submissions for select
  using (true);

-- Only the app (service role) can insert; no policy for anon/authenticated insert
-- so inserts go through your API with SUPABASE_SERVICE_ROLE_KEY only.

comment on table public.school_adjustment_submissions is
  'One row per AI Test Analyzer submission. GET /api/school-adjustment returns weighted average per school_id.';

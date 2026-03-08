-- Persist per-submission estimated difficulty from analyzer runs.
alter table if exists public.school_adjustment_submissions
  add column if not exists estimated_difficulty numeric;

comment on column public.school_adjustment_submissions.estimated_difficulty is
  'Estimated test difficulty (1-10) captured per analyzer submission.';

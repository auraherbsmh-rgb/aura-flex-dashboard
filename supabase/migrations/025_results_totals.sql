-- 025 · results_totals (scorecard, Meta 6). RECORD of what is applied in Supabase: sums over the judged days.
alter table public.concept_results add column totals jsonb not null default '{}'::jsonb;

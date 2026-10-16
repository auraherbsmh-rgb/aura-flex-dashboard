-- Creative engine: a winner paused in Meta (no longer live) leaves "alive" — logged with live = false.
alter table public.concept_state_log add column if not exists live boolean not null default true;

-- Backfill: winners already paused before this column existed get one "paused" row now.
insert into public.concept_state_log (task_id, state, live, at)
select r.task_id, r.state, false, now() from public.concept_results r
where r.live = false and r.state in ('won','deteriorating','recovering')
  and not exists (select 1 from public.concept_state_log l where l.task_id = r.task_id and l.live = false);

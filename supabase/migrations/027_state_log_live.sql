-- Creative engine: a winner paused in Meta (no longer live) leaves "alive" — logged with live = false.
alter table public.concept_state_log add column if not exists live boolean not null default true;

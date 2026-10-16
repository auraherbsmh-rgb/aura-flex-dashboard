-- 023 · Meta results (Meta 5). RECORD of migration meta_results_v1 as applied in Supabase.
-- concept_results: one row per dashboard concept, written by the daily pull (service role, src/lib/meta/results.ts).
create table public.concept_results (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  state text not null check (state in ('won','deteriorating','fading','recovering','testing','lost')),
  state_since timestamptz not null default now(),
  ever_won boolean not null default false,
  cpa7 numeric, line numeric not null, sales7 int not null default 0, spend7 numeric not null default 0,
  best_v int, variations jsonb not null default '[]'::jsonb,
  live boolean not null default false,
  updated_at timestamptz not null default now(),
  seen_state text, seen_at timestamptz,
  winner_noted_at timestamptz, winner_noted_by uuid references public.people(id)
);
alter table public.concept_results enable row level security;
create policy concept_results_read on public.concept_results for select
  using ((select private.is_founder()) or (select private.owns_task(task_id)));

-- The copywriter opens her RESULT item: it is seen until the state changes again.
create or replace function public.see_result(p_task uuid) returns text
language plpgsql security definer set search_path to '' as $function$
begin
  if not (private.owns_task(p_task) or private.is_founder()) then raise exception 'Not your concept.'; end if;
  update public.concept_results set seen_state = state, seen_at = now() where task_id = p_task;
  return 'seen';
end $function$;

-- Winner · core message (WINNER item): the angle's core message fills KEEP in every future task in that angle.
create or replace function public.save_winner(p_task uuid, p_message text) returns text
language plpgsql security definer set search_path to '' as $function$
declare v_angle uuid;
begin
  if not private.is_founder() then raise exception 'Only founders confirm winners.'; end if;
  if not exists (select 1 from public.concept_results where task_id = p_task and ever_won) then raise exception 'This concept has not won. Reload the page.'; end if;
  p_message := trim(coalesce(p_message, ''));
  if length(p_message) < 5 then raise exception 'Write the core message in one sentence.'; end if;
  if length(p_message) > 300 then raise exception 'Keep the core message under 300 characters.'; end if;
  select angle_id into v_angle from public.tasks where id = p_task;
  update public.list_items set core_message = p_message where id = v_angle;
  update public.concept_results set winner_noted_at = now(), winner_noted_by = private.current_person_id() where task_id = p_task;
  return 'saved';
end $function$;

-- Map with results: map_concepts() + each concept's Meta state (names and states only for copywriters).
create or replace function public.map_concepts2()
 returns table(task_id uuid, avatar_id uuid, avatar_code text, awareness text, angle_id uuid, angle_label text, angle_code text, angle_track text, format_label text, format_code text, origin text, status text, copywriter text, created_at timestamptz, face text, generate boolean, vo boolean, launched_at timestamptz, live_at timestamptz, hold_at timestamptz, variations jsonb, result_state text, ever_won boolean)
 language sql stable security definer set search_path to '' as $function$
  select m.*, cr.state, coalesce(cr.ever_won, false)
  from public.map_concepts() m left join public.concept_results cr on cr.task_id = m.task_id
$function$;

revoke execute on function public.see_result(uuid) from public, anon;
revoke execute on function public.save_winner(uuid, text) from public, anon;
revoke execute on function public.map_concepts2() from public, anon;
grant execute on function public.see_result(uuid), public.save_winner(uuid, text), public.map_concepts2() to authenticated;

-- meta_results_v2: won_at (set once, WINNER items count from it) + successor marking.
alter table public.concept_results add column won_at timestamptz;
create or replace function public.mark_successor(p_task uuid) returns text
language plpgsql security definer set search_path to '' as $function$
begin
  if not private.is_founder() then raise exception 'Only founders create successors.'; end if;
  update public.tasks set origin = 'successor' where id = p_task and origin = 'manual';
  return 'marked';
end $function$;
revoke execute on function public.mark_successor(uuid) from public, anon;
grant execute on function public.mark_successor(uuid) to authenticated;

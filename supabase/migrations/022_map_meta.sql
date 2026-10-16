-- 022 · Map start date + Meta (Live ads). RECORD of what is applied in Supabase (migrations map_v1 and meta_v1);
-- kept here so the repo can rebuild the database. Writes go through SECURITY DEFINER RPCs; tables are read-only to the app.

create table if not exists public.app_dates (
  key text primary key, label text not null, value date,
  updated_by uuid references public.people(id), updated_at timestamptz not null default now()
);
alter table public.app_dates enable row level security;
create policy app_dates_read on public.app_dates for select using (true);
insert into public.app_dates (key, label) values ('map_start', 'Map counts concepts launched from') on conflict do nothing;

create or replace function public.set_app_date(p_key text, p_value date) returns text
language plpgsql security definer set search_path to '' as $function$
begin
  if not private.is_founder() then raise exception 'Only founders can change Settings.'; end if;
  if p_value is not null and p_value > (now() at time zone 'Africa/Tunis')::date + 365 then raise exception 'That date is too far ahead.'; end if;
  update public.app_dates set value = p_value, updated_by = private.current_person_id(), updated_at = now() where key = p_key;
  if not found then raise exception 'Unknown setting.'; end if;
  return 'saved';
end $function$;

-- map_concepts(): every non-cancelled task with cell, angle, format, face, production dates and V# variations
-- (founders + copywriters). Full body: select pg_get_functiondef('public.map_concepts'::regproc).

-- campaign_scope (founders, all): campaign_id digits, kind ABO|CBO, track knee|hips — 4 rows (File 2 §1).

-- Meta copy, filled only by the daily pull (service role). Founders read; nobody writes from the app.
create table if not exists public.meta_ads (
  ad_id text primary key, name text not null, adset_id text, adset_name text, campaign_id text not null, status text,
  created_time timestamptz, first_seen timestamptz not null default now(), last_seen timestamptz not null default now()
);
create table if not exists public.meta_daily (
  ad_id text not null references public.meta_ads(ad_id), day date not null,
  spend numeric not null, purchases int not null, purchase_value numeric not null, impressions int not null, reach int not null,
  link_clicks int not null, plays_3s int not null, thruplays int not null, p25 int not null, p50 int not null, p75 int not null, p100 int not null,
  pulled_at timestamptz not null default now(), primary key (ad_id, day)
);
create table if not exists public.meta_budgets (
  entity_id text not null, kind text not null check (kind in ('adset','campaign')), day date not null, daily_budget numeric,
  primary key (entity_id, day)
);
create table if not exists public.meta_sync (
  id bigint generated always as identity primary key, started_at timestamptz not null default now(), finished_at timestamptz,
  ok boolean, message text, ads int, day_rows int
);
create table if not exists public.old_concepts (
  id uuid primary key default gen_random_uuid(), base_name text not null unique,
  avatar_id uuid not null references public.list_items(id),
  awareness text not null check (awareness in ('Problem-Aware','Solution-Aware','Product-Aware','Most-Aware')),
  angle_id uuid not null references public.list_items(id), format_id uuid not null references public.list_items(id),
  tag text not null check (tag ~ '^[A-Za-z0-9][A-Za-z0-9]{0,29}$'),
  created_by uuid references public.people(id), created_at timestamptz not null default now()
);
create table if not exists public.pause_answers (
  id uuid primary key default gen_random_uuid(), ad_id text not null, flag text not null,
  answer text not null check (answer in ('paused','not_now')), reason text check (reason is null or length(reason) <= 300),
  answered_by uuid references public.people(id), answered_at timestamptz not null default now()
);
alter table public.meta_ads enable row level security;
alter table public.meta_daily enable row level security;
alter table public.meta_budgets enable row level security;
alter table public.meta_sync enable row level security;
alter table public.old_concepts enable row level security;
alter table public.pause_answers enable row level security;
create policy meta_ads_read on public.meta_ads for select using ((select private.is_founder()));
create policy meta_daily_read on public.meta_daily for select using ((select private.is_founder()));
create policy meta_budgets_read on public.meta_budgets for select using ((select private.is_founder()));
create policy meta_sync_read on public.meta_sync for select using ((select private.is_founder()));
create policy old_concepts_read on public.old_concepts for select using ((select private.is_founder()));
create policy pause_answers_read on public.pause_answers for select using ((select private.is_founder()));

create or replace function public.tag_old_ad(p_base text, p_avatar uuid, p_awareness text, p_angle uuid, p_format uuid, p_tag text) returns uuid
language plpgsql security definer set search_path to '' as $function$
declare v_id uuid;
begin
  if not private.is_founder() then raise exception 'Only founders tag old ads.'; end if;
  p_base := lower(trim(coalesce(p_base, '')));
  if p_base = '' or length(p_base) > 200 then raise exception 'Unknown ad name. Reload the page.'; end if;
  if not exists (select 1 from public.list_items where id = p_avatar and list = 'avatar' and status = 'approved') then raise exception 'Pick the avatar.'; end if;
  if p_awareness is null or p_awareness not in ('Problem-Aware','Solution-Aware','Product-Aware','Most-Aware') then raise exception 'Pick the awareness.'; end if;
  if not exists (select 1 from public.list_items where id = p_angle and list = 'angle' and status = 'approved') then raise exception 'Pick the angle.'; end if;
  if not exists (select 1 from public.list_items where id = p_format and list = 'format' and status = 'approved') then raise exception 'Pick the format.'; end if;
  p_tag := trim(coalesce(p_tag, ''));
  if p_tag !~ '^[A-Za-z0-9][A-Za-z0-9]{0,29}$' then raise exception 'The concept tag must be one word in Latin letters or digits.'; end if;
  insert into public.old_concepts (base_name, avatar_id, awareness, angle_id, format_id, tag, created_by)
  values (p_base, p_avatar, p_awareness, p_angle, p_format, p_tag, private.current_person_id())
  on conflict (base_name) do update set avatar_id = excluded.avatar_id, awareness = excluded.awareness, angle_id = excluded.angle_id,
    format_id = excluded.format_id, tag = excluded.tag
  returning id into v_id;
  return v_id;
end $function$;

create or replace function public.answer_pause(p_ad text, p_flag text, p_answer text, p_reason text) returns text
language plpgsql security definer set search_path to '' as $function$
begin
  if not private.is_founder() then raise exception 'Only founders answer KILL items.'; end if;
  if not exists (select 1 from public.meta_ads where ad_id = p_ad) then raise exception 'Unknown ad. Reload the page.'; end if;
  if p_answer not in ('paused','not_now') then raise exception 'Pick an answer.'; end if;
  p_reason := nullif(trim(coalesce(p_reason, '')), '');
  if p_answer = 'not_now' and (p_reason is null or length(p_reason) < 3) then raise exception 'Say in one line why not now.'; end if;
  if length(p_reason) > 300 then raise exception 'Keep the reason short.'; end if;
  insert into public.pause_answers (ad_id, flag, answer, reason, answered_by) values (p_ad, coalesce(nullif(p_flag, ''), 'kill'), p_answer, p_reason, private.current_person_id());
  return p_answer;
end $function$;

revoke execute on function public.tag_old_ad(text, uuid, text, uuid, uuid, text) from public, anon;
revoke execute on function public.answer_pause(text, text, text, text) from public, anon;

-- Applied Oct 15, 2026. People + roles, private pay, step log, row-level security.
create type public.person_role as enum ('founder_1','founder_2','copywriter','editor','agency','strategist');

create table public.people (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  display_name text not null,
  role public.person_role not null,
  email text unique,
  does_ai_3d boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint login_roles_need_email check (role in ('agency','strategist') or email is not null)
);

create table public.people_pay (
  person_id uuid primary key references public.people(id) on delete cascade,
  pay_amount_tnd numeric,
  pay_unit text check (pay_unit in ('per_video','per_month','per_script')),
  rate_3d_tnd numeric,
  weekly_target int,
  updated_at timestamptz not null default now()
);

create table public.step_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid references public.people(id),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  detail jsonb not null default '{}'::jsonb
);
create index step_log_entity_idx on public.step_log (entity_type, entity_id, at);
create index step_log_actor_idx on public.step_log (actor_id, at);

create schema if not exists private;
grant usage on schema private to authenticated;

create function private.current_person_id() returns uuid
language sql stable security definer set search_path = '' as $$
  select p.id from public.people p where p.auth_user_id = auth.uid() and p.active $$;
create function private.current_role_name() returns text
language sql stable security definer set search_path = '' as $$
  select p.role::text from public.people p where p.auth_user_id = auth.uid() and p.active $$;
create function private.is_founder() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select p.role in ('founder_1','founder_2') from public.people p
                   where p.auth_user_id = auth.uid() and p.active), false) $$;
revoke execute on function private.current_person_id(), private.current_role_name(), private.is_founder() from public, anon;
grant execute on function private.current_person_id(), private.current_role_name(), private.is_founder() to authenticated;

create function private.link_auth_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.people set auth_user_id = new.id
   where lower(email) = lower(new.email) and auth_user_id is null;
  return new;
end $$;
revoke execute on function private.link_auth_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.link_auth_user();

alter table public.people enable row level security;
alter table public.people_pay enable row level security;
alter table public.step_log enable row level security;

create policy people_read on public.people for select to authenticated
  using (private.current_person_id() is not null);
create policy people_write_founders on public.people for all to authenticated
  using (private.is_founder()) with check (private.is_founder());
create policy pay_founders on public.people_pay for all to authenticated
  using (private.is_founder()) with check (private.is_founder());
create policy steplog_read on public.step_log for select to authenticated
  using (private.is_founder() or actor_id = private.current_person_id());
create policy steplog_insert on public.step_log for insert to authenticated
  with check (actor_id = private.current_person_id());

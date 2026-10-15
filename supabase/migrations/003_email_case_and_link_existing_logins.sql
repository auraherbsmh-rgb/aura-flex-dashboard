-- Applied Oct 15, 2026 (checker run 1 fixes). Emails compared without letter case; existing logins linked when a person is (re)added.
update public.people set email = lower(trim(email)) where email is not null;
alter table public.people drop constraint if exists people_email_key;
create unique index people_email_lower_key on public.people (lower(email));

create function private.normalize_people_email() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.email is not null then new.email := lower(trim(new.email)); end if;
  return new;
end $$;
create trigger people_normalize_email before insert or update of email on public.people
  for each row execute function private.normalize_people_email();

create function private.link_existing_login() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.email is not null and new.auth_user_id is null then
    select u.id into new.auth_user_id from auth.users u
     where lower(u.email) = lower(trim(new.email))
       and not exists (select 1 from public.people p where p.auth_user_id = u.id and p.id <> new.id)
     limit 1;
  end if;
  return new;
end $$;
revoke execute on function private.link_existing_login(), private.normalize_people_email() from public, anon, authenticated;
create trigger people_link_existing_login before insert or update of email on public.people
  for each row execute function private.link_existing_login();

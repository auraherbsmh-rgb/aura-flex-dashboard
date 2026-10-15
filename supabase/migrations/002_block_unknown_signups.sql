-- Applied Oct 15, 2026. Only emails a founder added (active, login role) can create a login.
create function private.guard_signup() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (
    select 1 from public.people p
     where lower(p.email) = lower(new.email) and p.active
       and p.role in ('founder_1','founder_2','copywriter','editor')
  ) then
    raise exception 'email not allowed';
  end if;
  return new;
end $$;
revoke execute on function private.guard_signup() from public, anon, authenticated;
create trigger guard_signup before insert on auth.users
  for each row execute function private.guard_signup();

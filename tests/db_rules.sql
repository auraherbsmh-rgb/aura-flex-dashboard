-- Database rule test. Run in the Supabase SQL editor (or via Claude); everything is rolled back.
-- Expected: cw sees people rows = (team size + 1) · cw sees pay rows = 0 · cw is_founder = false ·
--           cw role = copywriter · stranger signup = refused · cw linked to login = true
begin;
insert into public.people (id, display_name, role, email) values
  ('00000000-0000-0000-0000-0000000000c1','Copywriter T','copywriter','cw.test@invalid.test');
insert into public.people_pay (person_id, pay_amount_tnd, pay_unit) values ('00000000-0000-0000-0000-0000000000c1', 999, 'per_script');
insert into auth.users (id, email, aud, role, instance_id) values
  ('00000000-0000-0000-0000-0000000000a1','cw.test@invalid.test','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
create temp table results(check_name text, value text) on commit drop;
grant all on results to authenticated;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
insert into results select 'cw sees people rows', count(*)::text from public.people;
insert into results select 'cw sees pay rows', count(*)::text from public.people_pay;
insert into results select 'cw is_founder', private.is_founder()::text;
insert into results select 'cw role', private.current_role_name();
reset role;
do $$ begin
  begin
    insert into auth.users (id, email, aud, role, instance_id) values
      ('00000000-0000-0000-0000-0000000000a2','stranger@invalid.test','authenticated','authenticated','00000000-0000-0000-0000-000000000000');
    insert into results values ('stranger signup', 'ALLOWED (bad)');
  exception when others then
    insert into results values ('stranger signup', 'refused: ' || sqlerrm);
  end;
end $$;
insert into results select 'cw linked to login', (auth_user_id is not null)::text from public.people where id='00000000-0000-0000-0000-0000000000c1';
select * from results;
rollback;

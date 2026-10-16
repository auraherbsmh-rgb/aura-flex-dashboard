-- Production order v3 (checker fixes, Oct 16): version check against two founders overwriting each other; only the
-- current list keeps ranks (hold / resume clears a script's rank); old functions revoked. Applied via MCP:
-- production_order_v3, production_order_fn2 (production_order body is the one in 029).
create table if not exists public.production_order_version (id int primary key default 1 check (id = 1), v bigint not null default 0);
insert into public.production_order_version (id, v) values (1, 0) on conflict (id) do nothing;
alter table public.production_order_version enable row level security;
create policy "order version read" on public.production_order_version for select to authenticated using (true);

create or replace function public.set_production_order2(p_ids uuid[], p_version bigint) returns bigint
language plpgsql security definer set search_path = public as $$
declare cur bigint;
begin
  if not private.is_founder() then raise exception 'Only founders change the production order.'; end if;
  select v into cur from public.production_order_version where id = 1 for update;
  if cur <> p_version then raise exception 'The order was changed by the other founder. Reload the page to see it.'; end if;
  update public.tasks t set order_rank = x.ord
  from unnest(p_ids) with ordinality as x(id, ord)
  where t.id = x.id and t.status = 'details_done';
  update public.tasks set order_rank = null where order_rank is not null and not (id = any(p_ids));
  update public.production_order_version set v = v + 1 where id = 1 returning v into cur;
  return cur;
end $$;
revoke execute on function public.set_production_order2(uuid[], bigint) from public, anon;
grant execute on function public.set_production_order2(uuid[], bigint) to authenticated;

-- set_production_hold: same as before plus `update public.tasks set order_rank = null where id = p_task;`
revoke execute on function public.production_priority() from authenticated;
revoke execute on function public.pin_task(uuid, boolean) from authenticated;
revoke execute on function public.set_production_order(uuid[]) from authenticated;

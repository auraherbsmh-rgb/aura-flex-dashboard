-- Production order v2 (founder decision Oct 16): the founders set the order by hand (↑ / ↓, or "✓ Use suggested order"),
-- next to the dashboard's suggestion and the numbers behind it. Applied via MCP: production_order_columns, production_order_fn.
-- Replaces production_priority / pin_task / prio_pinned_at from 028 (left in place, unused: DROP is avoided).
alter table public.tasks add column if not exists successor_of uuid references public.tasks(id) on delete set null;
alter table public.tasks add column if not exists order_rank double precision;

create or replace function public.mark_successor2(p_task uuid, p_of uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_founder() then raise exception 'Only founders create successors.'; end if;
  update public.tasks set origin = case when origin = 'manual' then 'successor' else origin end,
    successor_of = case when p_of is not null and exists (select 1 from public.tasks w where w.id = p_of) then p_of else successor_of end
  where id = p_task;
end $$;
revoke execute on function public.mark_successor2(uuid, uuid) from public, anon;
grant execute on function public.mark_successor2(uuid, uuid) to authenticated;

create or replace function public.set_production_order(p_ids uuid[]) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_founder() then raise exception 'Only founders change the production order.'; end if;
  update public.tasks t set order_rank = x.ord
  from unnest(p_ids) with ordinality as x(id, ord)
  where t.id = x.id and t.status = 'details_done';
end $$;
revoke execute on function public.set_production_order(uuid[]) from public, anon;
grant execute on function public.set_production_order(uuid[]) to authenticated;

-- Suggestion: successors (biggest spend of the winner they replace first) → new variants of a winning cell (best CPA
-- first) → new tests and testimonials; then due date. Meta money (winner and cell CPA / spend) is returned to founders only.
create or replace function public.production_order() returns table(
  task_id uuid, sug int, grp int, order_rank double precision, due_on date,
  winner_task uuid, winner_face text, winner_state text, winner_cpa7 numeric, winner_line numeric, winner_spend_day numeric, winner_sales_day numeric, winner_since timestamptz,
  cell_alive int, cell_best_cpa numeric, cell_spend_day numeric, cell_tested int, cell_won int, cell_lost int)
language sql stable security definer set search_path = public as $$
  with prod as (
    select t.* from public.tasks t left join public.productions p on p.task_id = t.id
    where t.status = 'details_done' and p.launched_at is null and p.hold_at is null
      and not exists (select 1 from public.edit_rounds e where e.task_id = t.id and e.decision = 'approved')
  ), res as (
    select r.*, t.avatar_id, t.awareness, t.angle_id from public.concept_results r join public.tasks t on t.id = r.task_id
  ), x as (
    select p.id, p.origin, p.due_on, p.created_at, p.order_rank,
      coalesce(p.successor_of, (select r.task_id from res r where r.avatar_id = p.avatar_id and r.awareness = p.awareness and r.angle_id = p.angle_id
        and r.ever_won and r.state in ('fading', 'deteriorating') order by r.spend7 desc nulls last limit 1)) as win_id,
      (select count(*) from res r where r.avatar_id = p.avatar_id and r.awareness = p.awareness and r.state in ('won', 'recovering', 'deteriorating') and r.live)::int as alive,
      (select min(r.cpa7) from res r where r.avatar_id = p.avatar_id and r.awareness = p.awareness and r.state in ('won', 'recovering', 'deteriorating') and r.live) as best_cpa,
      (select sum(r.spend7) / 7 from res r where r.avatar_id = p.avatar_id and r.awareness = p.awareness and r.live) as cell_spend,
      (select count(*) from res r where r.avatar_id = p.avatar_id and r.awareness = p.awareness)::int as tested,
      (select count(*) from res r where r.avatar_id = p.avatar_id and r.awareness = p.awareness and r.ever_won)::int as won,
      (select count(*) from res r where r.avatar_id = p.avatar_id and r.awareness = p.awareness and r.state = 'lost' and not r.ever_won)::int as lost
    from prod p
  ), y as (
    select x.*, w.state as w_state, w.cpa7 as w_cpa, w.line as w_line, w.spend7 / 7 as w_spend, w.sales7::numeric / 7 as w_sales, w.state_since as w_since,
      (select d.face from public.script_details d where d.task_id = x.win_id) as w_face,
      case when x.origin = 'successor' then 1 when x.alive > 0 then 2 when x.origin = 'testimonial' then 4 else 3 end as g
    from x left join public.concept_results w on w.task_id = x.win_id and w.state in ('fading', 'deteriorating')
  )
  select y.id,
    (row_number() over (order by least(y.g, 3),
       case when y.g = 1 then -coalesce(y.w_spend, 0) when y.g = 2 then coalesce(y.best_cpa, 999) else 0 end,
       y.due_on, y.created_at, y.id))::int,
    y.g, y.order_rank, y.due_on,
    case when fz.f and y.w_state is not null then y.win_id end, case when fz.f then y.w_face end, case when fz.f then y.w_state end, case when fz.f then y.w_cpa end, case when fz.f then y.w_line end,
    case when fz.f then y.w_spend end, case when fz.f then y.w_sales end, case when fz.f then y.w_since end,
    y.alive, case when fz.f then y.best_cpa end, case when fz.f then y.cell_spend end,
    case when fz.f then y.tested else 0 end, case when fz.f then y.won else 0 end, case when fz.f then y.lost else 0 end
  from y cross join (select private.is_founder() as f) fz
  where auth.uid() is not null;
$$;
revoke execute on function public.production_order() from public, anon;
grant execute on function public.production_order() to authenticated;

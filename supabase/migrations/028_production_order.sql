-- Production order (founder decision Oct 16): one order for everyone — moved to top (latest first) → successors →
-- new variants of a winning cell → new tests and testimonials; then the earliest due date. Applied via MCP:
-- production_priority, production_priority_hold, production_priority_testimonial.
alter table public.tasks add column if not exists prio_pinned_at timestamptz;

create or replace function public.pin_task(p_task uuid, p_on boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not private.is_founder() then raise exception 'Only founders change the production order.'; end if;
  update public.tasks set prio_pinned_at = case when p_on then now() else null end where id = p_task and status = 'details_done';
  if not found then raise exception 'Only a script in production can be moved.'; end if;
end $$;
revoke execute on function public.pin_task(uuid, boolean) from public, anon;
grant execute on function public.pin_task(uuid, boolean) to authenticated;

create or replace function public.production_priority() returns table(task_id uuid, pos int, grp int, pinned boolean)
language sql stable security definer set search_path = public as $$
  with win as (
    select distinct t.avatar_id, t.awareness from public.concept_results r join public.tasks t on t.id = r.task_id
    where r.state in ('won', 'recovering', 'deteriorating') and r.live
  ), prod as (
    select t.id, t.prio_pinned_at, t.due_on, t.created_at,
      case when t.origin = 'successor' then 1
           when exists (select 1 from win w where w.avatar_id = t.avatar_id and w.awareness = t.awareness) then 2
           when t.origin = 'testimonial' then 4
           else 3 end as grp
    from public.tasks t left join public.productions p on p.task_id = t.id
    where t.status = 'details_done' and p.launched_at is null and p.hold_at is null
  )
  -- grp 4 (testimonial) ranks with new tests (3); it only changes the label.
  select id, (row_number() over (order by prio_pinned_at desc nulls last, least(grp, 3), due_on, created_at))::int, grp, prio_pinned_at is not null
  from prod where auth.uid() is not null;
$$;
revoke execute on function public.production_priority() from public, anon;
grant execute on function public.production_priority() to authenticated;

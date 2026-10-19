-- Cash at Shipper (Oct 19): Shipper's API shows no withdrawals, so founders enter them (and customer refunds).
-- The baseline row = everything taken out of the balance up to Oct 19, 2026, from Shipper's transaction export.
create table if not exists public.shipper_cash_out (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('withdrawal','refund','baseline')),
  amount_tnd numeric(14,3) not null check (amount_tnd > 0),
  day date not null,
  note text,
  created_by uuid references public.people(id),
  created_at timestamptz not null default now()
);
alter table public.shipper_cash_out enable row level security;
create policy cash_out_founders on public.shipper_cash_out for all to authenticated
  using (private.is_founder()) with check (private.is_founder() and kind <> 'baseline');
insert into public.shipper_cash_out (kind, amount_tnd, day, note)
values ('baseline', 1038246.80, '2026-10-19', 'Everything taken out of the Shipper balance up to Oct 19, 2026: withdrawals 1,037,378.16 (successful + under review) + charges not tied to orders 868.64. From Shipper''s transaction export, checked against the top bar on Oct 17 and Oct 19 (gap 0.00).');

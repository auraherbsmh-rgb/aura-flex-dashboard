-- 026 · Shipper copy for Business · Money. RECORD of migration shipper_v1 as applied in Supabase.
-- Filled only by the daily Shipper pull (service role) once the API is connected; founders read, nobody writes from the app.
create table public.shipper_orders (
  order_id text primary key,
  ordered_at timestamptz not null,
  channel text not null check (channel in ('website','dm')),
  bottles int not null default 1 check (bottles >= 0),
  total_tnd numeric not null default 0,
  status text not null check (status in ('new','confirmed','shipped','delivered','returned','cancelled')),
  reason text check (reason in ('duplicate','disqualified','unreachable','wrong_number','other')),
  delivery_cost_tnd numeric,
  shipped_at timestamptz,
  settled_at timestamptz,
  updated_at timestamptz not null default now()
);
create index shipper_orders_ordered on public.shipper_orders (ordered_at);
create table public.shipper_stock (day date primary key, bottles int not null);
create table public.shipper_cash (day date primary key, collected_unpaid_tnd numeric not null, in_transit_tnd numeric not null);
create table public.shipper_sync (
  id bigint generated always as identity primary key, started_at timestamptz not null default now(), finished_at timestamptz,
  ok boolean, message text, orders int
);
alter table public.shipper_orders enable row level security;
alter table public.shipper_stock enable row level security;
alter table public.shipper_cash enable row level security;
alter table public.shipper_sync enable row level security;
create policy shipper_orders_read on public.shipper_orders for select using ((select private.is_founder()));
create policy shipper_stock_read on public.shipper_stock for select using ((select private.is_founder()));
create policy shipper_cash_read on public.shipper_cash for select using ((select private.is_founder()));
create policy shipper_sync_read on public.shipper_sync for select using ((select private.is_founder()));

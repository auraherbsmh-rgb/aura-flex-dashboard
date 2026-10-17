-- Shipper balance (Oct 17): Shipper's API has no balance endpoint; the pull rebuilds it from /dashboard/overview.
alter table public.shipper_cash add column if not exists balance_tnd numeric, add column if not exists parts jsonb, add column if not exists at timestamptz;

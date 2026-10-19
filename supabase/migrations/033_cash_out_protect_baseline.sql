-- Checker (Oct 19): the baseline row must not be deleted or changed, even from a founder session.
create policy cash_out_keep_baseline_delete on public.shipper_cash_out as restrictive for delete to authenticated using (kind <> 'baseline');
create policy cash_out_keep_baseline_update on public.shipper_cash_out as restrictive for update to authenticated using (kind <> 'baseline') with check (kind <> 'baseline');

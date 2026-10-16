-- 024 · Format bands for opening / hold / clicks (File 3 §3, §5). RECORD of what is applied in Supabase.
insert into public.alert_rules (key, grp, label, value, unit, sort) values
 ('band_hook_low','live','Video opening (hook rate) healthy from',29,'% · File 3 §5',10),
 ('band_hold_low','live','Video hold healthy from',23,'% · File 3 §5',11),
 ('band_ctr_video_low','live','Video clicks (CTR) healthy from',2.4,'% · File 3 §3',12),
 ('band_ctr_image_low','live','Static clicks (CTR) healthy from',1.5,'% · File 3 §3',13),
 ('band_min_impressions','live','Opening / hold / clicks shown from',1000,'impressions',14)
on conflict (key) do nothing;
-- Colour stays off until the bands are checked against recent winners.
insert into public.app_flags (key, enabled, label) values ('colour_script_parts', false, 'Colour opening / hold / clicks (green in band, red below)') on conflict (key) do nothing;

create or replace function public.script_part_bands() returns jsonb
language sql stable security definer set search_path to '' as $function$
  select case when private.current_person_id() is null then null else jsonb_build_object(
    'on', coalesce((select enabled from public.app_flags where key = 'colour_script_parts'), false),
    'hook', (select value from public.alert_rules where key = 'band_hook_low'),
    'hold', (select value from public.alert_rules where key = 'band_hold_low'),
    'ctrVideo', (select value from public.alert_rules where key = 'band_ctr_video_low'),
    'ctrImage', (select value from public.alert_rules where key = 'band_ctr_image_low'),
    'minImpressions', (select value from public.alert_rules where key = 'band_min_impressions')
  ) end
$function$;
revoke execute on function public.script_part_bands() from public, anon;
grant execute on function public.script_part_bands() to authenticated;

-- Oct 16 (founder OK): bands re-checked on the launch weeks of the account's winners
-- (VSL_Variation_4 Sep 2025 · BOULBEBA V2 ABO + CBO Mar–Apr 2026 · Standing-Profession UGC V2 + static V1 Mar–May 2026).
update public.alert_rules set value = 27, unit = '% · winners Oct 16' where key = 'band_hook_low';
update public.alert_rules set unit = '% · winners Oct 16' where key = 'band_hold_low';
update public.alert_rules set value = 1.2, label = 'Video clicks (link CTR) healthy from', unit = '% · winners Oct 16' where key = 'band_ctr_video_low';
update public.alert_rules set label = 'Static clicks (link CTR) healthy from', unit = '% · 1 winner' where key = 'band_ctr_image_low';
update public.app_flags set enabled = true where key = 'colour_script_parts';

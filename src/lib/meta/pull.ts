// Server only: reads secrets from the environment. Never import this from a "use client" file.
import { createClient as createAdminClient } from "@supabase/supabase-js";

/**
 * Daily Meta pull (phase 3, handoff §12 "daily Meta pull by ad name"). Read-only on Meta: it only GETs.
 * Switched off until the founder adds, in Vercel → Settings → Environment Variables:
 *   META_ACCESS_TOKEN          a Meta system-user token with ads_read on the ad account
 *   SUPABASE_SERVICE_ROLE_KEY  so the server can write the copy (never sent to the browser)
 *   CRON_SECRET                any long random text; Vercel sends it with the daily call
 * Only ads in the campaigns listed in Settings → Data (campaign_scope, active) are read.
 */

export const META_ACCOUNT_ID = "1554396541884989";
const GRAPH = "https://graph.facebook.com/v21.0";
/** Days re-read every run: Meta keeps attributing purchases for a few days, so recent days are refreshed. */
const REFRESH_DAYS = 10;
/** First run: this much history, so 30-day and weekly verdicts work from day one. */
const BACKFILL_DAYS = 90;

export type MetaStatus = { token: boolean; serviceKey: boolean; cronSecret: boolean; ready: boolean };
export function metaStatus(): MetaStatus {
  const token = !!process.env.META_ACCESS_TOKEN;
  const serviceKey = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  const cronSecret = !!process.env.CRON_SECRET;
  return { token, serviceKey, cronSecret, ready: token && serviceKey };
}

type Paged<T> = { data?: T[]; paging?: { next?: string }; error?: { message?: string } };

async function getAll<T>(url: string): Promise<T[]> {
  const out: T[] = [];
  let next: string | undefined = url;
  for (let page = 0; next && page < 50; page++) {
    const res: Response = await fetch(next, { cache: "no-store" });
    const body = (await res.json()) as Paged<T>;
    if (!res.ok || body.error) throw new Error(`Meta said: ${body.error?.message ?? res.statusText}`);
    out.push(...(body.data ?? []));
    next = body.paging?.next;
  }
  return out;
}

type Action = { action_type: string; value: string };
const num = (v: unknown) => (v === undefined || v === null || v === "" ? 0 : Number(v));
/** Website purchases only (File 3 §9: Purchases = Website purchases, never omni). */
const PURCHASE = "offsite_conversion.fb_pixel_purchase";
const pick = (list: Action[] | undefined, type: string) => num(list?.find((a) => a.action_type === type)?.value);
const videoTotal = (list: Action[] | undefined) => (list ?? []).reduce((n, a) => n + num(a.value), 0);

export type InsightRow = {
  ad_id: string;
  date_start: string;
  spend?: string;
  impressions?: string;
  reach?: string;
  inline_link_clicks?: string;
  actions?: Action[];
  action_values?: Action[];
  video_thruplay_watched_actions?: Action[];
  video_p25_watched_actions?: Action[];
  video_p50_watched_actions?: Action[];
  video_p75_watched_actions?: Action[];
  video_p100_watched_actions?: Action[];
};

/** One Meta insights row (level ad, one day) → one meta_daily row. Exported for the known-answer tests. */
export function toDailyRow(r: InsightRow) {
  return {
    ad_id: r.ad_id,
    day: r.date_start,
    spend: num(r.spend),
    purchases: Math.round(pick(r.actions, PURCHASE)),
    purchase_value: pick(r.action_values, PURCHASE),
    impressions: Math.round(num(r.impressions)),
    reach: Math.round(num(r.reach)),
    link_clicks: Math.round(num(r.inline_link_clicks)),
    plays_3s: Math.round(pick(r.actions, "video_view")),
    thruplays: Math.round(videoTotal(r.video_thruplay_watched_actions)),
    p25: Math.round(videoTotal(r.video_p25_watched_actions)),
    p50: Math.round(videoTotal(r.video_p50_watched_actions)),
    p75: Math.round(videoTotal(r.video_p75_watched_actions)),
    p100: Math.round(videoTotal(r.video_p100_watched_actions)),
    pulled_at: new Date().toISOString(),
  };
}

const tunisDay = (ms: number) => new Date(ms + 36e5).toISOString().slice(0, 10);

/** Runs one pull. Returns a plain-language result; every run is written to meta_sync. */
export async function runMetaPull(): Promise<{ ok: boolean; message: string }> {
  const st = metaStatus();
  if (!st.ready) {
    const missing = [!st.token && "Meta token", !st.serviceKey && "server key"].filter(Boolean).join(" and ");
    return { ok: false, message: `Meta is not connected yet: the ${missing} must be added in Vercel.` };
  }
  const token = process.env.META_ACCESS_TOKEN!;
  const db = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const { data: run } = await db.from("meta_sync").insert({}).select("id").single();
  const finish = async (ok: boolean, message: string, ads = 0, rows = 0) => {
    if (run) await db.from("meta_sync").update({ finished_at: new Date().toISOString(), ok, message, ads, day_rows: rows }).eq("id", run.id);
    return { ok, message };
  };
  try {
    const { data: scope } = await db.from("campaign_scope").select("campaign_id, kind").eq("active", true);
    const ids = (scope ?? []).map((c) => c.campaign_id as string);
    if (!ids.length) return finish(false, "No campaign in scope (Settings → Data).");
    const filter = encodeURIComponent(JSON.stringify([{ field: "campaign.id", operator: "IN", value: ids }]));
    const auth = `access_token=${encodeURIComponent(token)}`;

    // 1. Ads (every status, so paused ones are known too).
    type AdRow = { id: string; name: string; adset_id?: string; adset?: { name?: string; daily_budget?: string }; campaign_id: string; effective_status?: string; created_time?: string };
    const ads = await getAll<AdRow>(`${GRAPH}/act_${META_ACCOUNT_ID}/ads?fields=id,name,adset_id,adset{name,daily_budget},campaign_id,effective_status,created_time&filtering=${filter}&limit=500&${auth}`);
    const now = new Date().toISOString();
    if (ads.length) {
      const { error } = await db.from("meta_ads").upsert(ads.map((a) => ({
        ad_id: a.id, name: a.name, adset_id: a.adset_id ?? null, adset_name: a.adset?.name ?? null, campaign_id: a.campaign_id,
        status: a.effective_status ?? null, created_time: a.created_time ?? null, last_seen: now,
      })), { onConflict: "ad_id", ignoreDuplicates: false });
      if (error) throw new Error(`Could not save the ads: ${error.message}`);
    }

    // 2. Daily results: the last REFRESH_DAYS days, or BACKFILL_DAYS on the first run.
    const { count } = await db.from("meta_daily").select("ad_id", { count: "exact", head: true });
    const days = count ? REFRESH_DAYS : BACKFILL_DAYS;
    const until = tunisDay(Date.now());
    const since = tunisDay(Date.now() - (days - 1) * 864e5);
    const fields = [
      "ad_id", "spend", "impressions", "reach", "inline_link_clicks", "actions", "action_values",
      "video_thruplay_watched_actions", "video_p25_watched_actions", "video_p50_watched_actions", "video_p75_watched_actions", "video_p100_watched_actions",
    ].join(",");
    const range = encodeURIComponent(JSON.stringify({ since, until }));
    const insights = await getAll<InsightRow>(`${GRAPH}/act_${META_ACCOUNT_ID}/insights?level=ad&time_increment=1&time_range=${range}&fields=${fields}&filtering=${filter}&limit=500&${auth}`);
    const known = new Set(ads.map((a) => a.id));
    const rows = insights.filter((r) => known.has(r.ad_id)).map(toDailyRow);
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from("meta_daily").upsert(rows.slice(i, i + 500), { onConflict: "ad_id,day" });
      if (error) throw new Error(`Could not save the daily results: ${error.message}`);
    }

    // 3. Today's budgets: ad sets (ABO) and campaigns (CBO), for "budget change < 48h = no verdict".
    const cbo = new Set((scope ?? []).filter((c) => c.kind === "CBO").map((c) => c.campaign_id as string));
    const budgets: { entity_id: string; kind: string; day: string; daily_budget: number | null }[] = [];
    const adsets = new Map<string, number | null>();
    for (const a of ads) if (a.adset_id && !cbo.has(a.campaign_id)) adsets.set(a.adset_id, a.adset?.daily_budget ? num(a.adset.daily_budget) / 100 : null);
    for (const [id, b] of adsets) budgets.push({ entity_id: id, kind: "adset", day: until, daily_budget: b });
    if (cbo.size) {
      type Camp = { id: string; daily_budget?: string };
      const camps = await getAll<Camp>(`${GRAPH}/act_${META_ACCOUNT_ID}/campaigns?fields=id,daily_budget&filtering=${encodeURIComponent(JSON.stringify([{ field: "id", operator: "IN", value: [...cbo] }]))}&${auth}`);
      for (const c of camps) budgets.push({ entity_id: c.id, kind: "campaign", day: until, daily_budget: c.daily_budget ? num(c.daily_budget) / 100 : null });
    }
    if (budgets.length) await db.from("meta_budgets").upsert(budgets, { onConflict: "entity_id,day" });

    return finish(true, `Pulled ${ads.length} ads and ${rows.length} ad-days (${since} → ${until}).`, ads.length, rows.length);
  } catch (e) {
    return finish(false, e instanceof Error ? e.message.replace(token, "…") : "The pull failed.");
  }
}

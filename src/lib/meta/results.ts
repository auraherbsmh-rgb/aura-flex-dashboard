// Server only, run by the daily pull (service role): turns the Meta copy into one result row per dashboard concept.
import type { SupabaseClient } from "@supabase/supabase-js";
import { buildLive, conceptResultRows } from "@/lib/live-shared";
import { toMoneyInputs, type MoneyRow } from "@/lib/money";
import type { Budget, MetaAd, MetaDay, Scope } from "@/lib/meta-shared";

const tunisDay = (ms: number) => new Date(ms + 36e5).toISOString().slice(0, 10);

async function all<T>(q: (a: number, b: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const out: T[] = [];
  for (let a = 0; ; a += 1000) {
    const { data, error } = await q(a, a + 999);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

/** Recomputes concept_results. A state change resets state_since (what RESULT, WINNER and ALERT items count from). */
export async function refreshResults(db: SupabaseClient, now = Date.now()): Promise<number> {
  const since = tunisDay(now - 75 * 864e5);
  type A = { ad_id: string; name: string; campaign_id: string; adset_id: string | null; status: string | null; created_time: string | null };
  type D = { ad_id: string; day: string; spend: number; purchases: number; purchase_value: number; impressions: number; reach: number; link_clicks: number; plays_3s: number; thruplays: number; p25: number; p50: number; p75: number; p100: number };
  const [adsRows, dailyRows, budgetRows, scopeRows, money, vars, oldRows, existing] = await Promise.all([
    all<A>((a, b) => db.from("meta_ads").select("ad_id, name, campaign_id, adset_id, status, created_time").order("ad_id").range(a, b)),
    all<D>((a, b) => db.from("meta_daily").select("ad_id, day, spend, purchases, purchase_value, impressions, reach, link_clicks, plays_3s, thruplays, p25, p50, p75, p100").gte("day", since).order("ad_id").order("day").range(a, b)),
    db.from("meta_budgets").select("entity_id, day, daily_budget").gte("day", tunisDay(now - 10 * 864e5)),
    db.from("campaign_scope").select("campaign_id, kind, track").eq("active", true),
    db.from("money_settings").select("*").order("month", { ascending: false }).limit(1).maybeSingle(),
    all<{ task_id: string; v: number; ad_name: string }>((a, b) => db.from("ad_variations").select("task_id, v, ad_name").eq("active", true).order("task_id").range(a, b)),
    db.from("old_concepts").select("id, base_name"),
    db.from("concept_results").select("task_id, state, ever_won, won_at"),
  ]);
  // A failed read must not look like "no data": it would reset every state_since (and the 48h covers).
  for (const r of [budgetRows, scopeRows, money, oldRows, existing]) if (r.error) throw new Error(r.error.message);
  if (!money.data) return 0;
  const ads: MetaAd[] = adsRows.map((r) => ({ adId: r.ad_id, name: r.name, campaignId: r.campaign_id, adsetId: r.adset_id, status: r.status, createdTime: r.created_time }));
  const daily: MetaDay[] = dailyRows.map((r) => ({
    adId: r.ad_id, day: r.day, spend: Number(r.spend), purchases: r.purchases, purchaseValue: Number(r.purchase_value), impressions: r.impressions, reach: r.reach,
    linkClicks: r.link_clicks, plays3s: r.plays_3s, thruplays: r.thruplays, p25: r.p25, p50: r.p50, p75: r.p75, p100: r.p100,
  }));
  const budgets: Budget[] = (budgetRows.data ?? []).map((b) => ({ entityId: b.entity_id as string, day: b.day as string, dailyBudget: b.daily_budget === null ? null : Number(b.daily_budget) }));
  const scope: Scope[] = (scopeRows.data ?? []).map((s) => ({ campaignId: s.campaign_id as string, kind: s.kind as "ABO" | "CBO", track: s.track as string }));
  const generated = new Map(vars.map((v) => [v.ad_name.trim().toLowerCase(), { taskId: v.task_id, v: v.v }]));
  const old = new Map(((oldRows.data ?? []) as { id: string; base_name: string }[]).map((o) => [o.base_name, o.id]));
  const model = buildLive({ ads, daily, scope, budgets, generated, old, concepts: new Map(), money: toMoneyInputs(money.data as MoneyRow), now });
  type Prev = { task_id: string; state: string; ever_won: boolean; won_at: string | null };
  const prev = new Map(((existing.data ?? []) as Prev[]).map((r) => [r.task_id, r]));
  // A concept whose ads have no spend in the loaded days keeps its last result (a win is never forgotten).
  const rows = conceptResultRows(model.states).filter((r) => !(prev.has(r.task_id) && r.variations.every((v) => v.spend7 === 0) && !r.live && quiet(model.states.get(`t:${r.task_id}`))));
  const stamp = new Date(now).toISOString();
  const payload = rows.map((r) => {
    const p = prev.get(r.task_id);
    const everWon = !!p?.ever_won || r.ever_won;
    return {
      ...r, ever_won: everWon, won_at: p?.won_at ?? (everWon ? stamp : null), updated_at: stamp,
      // New state: the clock restarts and the copywriter has a new verdict to see.
      ...(p?.state !== r.state ? { state_since: stamp, seen_state: null, seen_at: null } : {}),
    };
  });
  // Two batches so rows keeping their state never send state_since / seen_state.
  const changed = payload.filter((r) => "state_since" in r);
  const same = payload.filter((r) => !("state_since" in r));
  if (changed.length) { const { error } = await db.from("concept_results").upsert(changed, { onConflict: "task_id" }); if (error) throw new Error(error.message); }
  if (same.length) { const { error } = await db.from("concept_results").upsert(same, { onConflict: "task_id" }); if (error) throw new Error(error.message); }
  // Concepts no longer matched to any ad (variations renamed or removed) drop out of the results.
  const matched = new Set([...model.states.keys()].filter((k) => k.startsWith("t:")).map((k) => k.slice(2)));
  const stale = [...prev.keys()].filter((id) => !matched.has(id));
  if (stale.length) { const { error } = await db.from("concept_results").delete().in("task_id", stale); if (error) throw new Error(error.message); }
  return rows.length;
}

/** No spend at all in the loaded days (life totals are window-bound): nothing new to judge. */
function quiet(s: { vars: { life: { spend: number } }[] } | undefined) {
  return !s || s.vars.every((v) => v.life.spend === 0);
}

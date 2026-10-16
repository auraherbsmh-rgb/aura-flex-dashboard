// Server only: loads the Meta copy + everything the Live ads model needs (founders; RLS keeps others out).
import { createClient } from "@/lib/supabase/server";
import { allRows, getMapData } from "@/lib/tasks";
import { getRule } from "@/lib/needs";
import { getCurrentMoney, toMoneyInputs } from "@/lib/settings/data";
import { metaStatus } from "@/lib/meta/pull";
import { buildLive, killNeeds, unmappedNeeds, type ConceptInfo, type KillNeed, type PauseAnswer, type UnmappedNeed } from "@/lib/live-shared";
import type { Budget, MetaAd, MetaDay, Scope } from "@/lib/meta-shared";

const tunisDay = (ms: number) => new Date(ms + 36e5).toISOString().slice(0, 10);

export type LastPull = { started_at: string; finished_at: string | null; ok: boolean | null; message: string | null } | null;

export async function getLiveData(now: number, mapData?: ReturnType<typeof getMapData>) {
  const supabase = await createClient();
  const since = tunisDay(now - 75 * 864e5);
  type A = { ad_id: string; name: string; campaign_id: string; adset_id: string | null; status: string | null; created_time: string | null; first_seen: string };
  type D = { ad_id: string; day: string; spend: number; purchases: number; purchase_value: number; impressions: number; reach: number; link_clicks: number; plays_3s: number; thruplays: number; p25: number; p50: number; p75: number; p100: number };
  type O = { id: string; base_name: string; awareness: string; tag: string; avatar: { code: string } | null; angle: { label: string; track: string | null } | null; format: { label: string; code: string } | null };
  const [adsRows, dailyRows, budgetRows, scopeRows, moneyRow, d3Min, oldRows, lastPull, map, prods, answerRows, okPull] = await Promise.all([
    allRows<A>("Meta ads", (a, b) => supabase.from("meta_ads").select("ad_id, name, campaign_id, adset_id, status, created_time, first_seen").order("ad_id").range(a, b) as unknown as PromiseLike<{ data: A[] | null; error: unknown }>),
    allRows<D>("Meta results", (a, b) => supabase.from("meta_daily").select("ad_id, day, spend, purchases, purchase_value, impressions, reach, link_clicks, plays_3s, thruplays, p25, p50, p75, p100").gte("day", since).order("ad_id").order("day").range(a, b) as unknown as PromiseLike<{ data: D[] | null; error: unknown }>),
    supabase.from("meta_budgets").select("entity_id, day, daily_budget").gte("day", tunisDay(now - 10 * 864e5)),
    supabase.from("campaign_scope").select("campaign_id, kind, track").eq("active", true),
    getCurrentMoney(),
    getRule("d3_colour_min_sales", 5),
    supabase.from("old_concepts").select("id, base_name, awareness, tag, avatar:list_items!old_concepts_avatar_id_fkey(code), angle:list_items!old_concepts_angle_id_fkey(label, track), format:list_items!old_concepts_format_id_fkey(label, code)"),
    supabase.from("meta_sync").select("started_at, finished_at, ok, message").order("id", { ascending: false }).limit(1).maybeSingle(),
    mapData ?? getMapData(),
    supabase.from("productions").select("task_id, launched_at, editor:people!productions_editor_id_fkey(display_name)"),
    supabase.from("pause_answers").select("ad_id, answer, reason, answered_at").gte("answered_at", new Date(now - 90 * 864e5).toISOString()),
    supabase.from("meta_sync").select("started_at").eq("ok", true).order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const status = metaStatus();
  if (!moneyRow) return { status, lastPull: (lastPull.data as LastPull) ?? null, d3Min, model: null, noMoney: true as const, hasData: false, kills: [] as KillNeed[], unmappedItems: [] as UnmappedNeed[] };

  const ads: MetaAd[] = adsRows.map((r) => ({ adId: r.ad_id, name: r.name, campaignId: r.campaign_id, adsetId: r.adset_id, status: r.status, createdTime: r.created_time }));
  const daily: MetaDay[] = dailyRows.map((r) => ({
    adId: r.ad_id, day: r.day, spend: Number(r.spend), purchases: r.purchases, purchaseValue: Number(r.purchase_value), impressions: r.impressions, reach: r.reach,
    linkClicks: r.link_clicks, plays3s: r.plays_3s, thruplays: r.thruplays, p25: r.p25, p50: r.p50, p75: r.p75, p100: r.p100,
  }));
  const budgets: Budget[] = (budgetRows.data ?? []).map((b) => ({ entityId: b.entity_id as string, day: b.day as string, dailyBudget: b.daily_budget === null ? null : Number(b.daily_budget) }));
  const scope: Scope[] = (scopeRows.data ?? []).map((s) => ({ campaignId: s.campaign_id as string, kind: s.kind as "ABO" | "CBO", track: s.track as string }));

  type P = { task_id: string; launched_at: string | null; editor: { display_name: string } | null };
  const prodBy = new Map(((prods.data ?? []) as unknown as P[]).map((p) => [p.task_id, p]));
  const generated = new Map<string, { taskId: string; v: number }>();
  const concepts = new Map<string, ConceptInfo>();
  for (const c of map.concepts) {
    const hooks: ConceptInfo["hooks"] = {};
    for (const v of c.variations) {
      generated.set(v.name.trim().toLowerCase(), { taskId: c.taskId, v: v.v });
      hooks[v.v] = { type: v.type, line: v.line, name: v.name };
    }
    const p = prodBy.get(c.taskId);
    concepts.set(`t:${c.taskId}`, {
      key: `t:${c.taskId}`, name: c.face ?? c.angle, cell: `${c.avatarCode} × ${c.awareness.replace("-Aware", "")}`, angle: c.angle,
      format: c.origin === "testimonial" ? "Testimonial" : c.generate ? "AI / 3D" : c.format, formatCode: c.formatCode, track: c.track,
      copywriter: c.copywriter, editor: p?.editor?.display_name ?? null, launchedAt: p?.launched_at ?? null, taskId: c.taskId, hooks,
    });
  }
  const old = new Map<string, string>();
  for (const o of (oldRows.data ?? []) as unknown as O[]) {
    old.set(o.base_name, o.id);
    concepts.set(`o:${o.id}`, {
      key: `o:${o.id}`, name: o.tag, cell: `${o.avatar?.code ?? "?"} × ${o.awareness.replace("-Aware", "")}`, angle: o.angle?.label ?? "—",
      format: o.format?.label ?? "—", formatCode: o.format?.code ?? "?", track: o.angle?.track ?? null, copywriter: null, editor: null, launchedAt: null, taskId: null, hooks: {},
    });
  }
  const answers: PauseAnswer[] = (answerRows.data ?? []).map((a) => ({ adId: a.ad_id as string, answer: a.answer as "paused" | "not_now", reason: a.reason as string | null, answeredAt: a.answered_at as string }));
  const money = toMoneyInputs(moneyRow);
  const model = buildLive({ ads, daily, scope, budgets, generated, old, concepts, money, now });
  const okPullAt = (okPull.data?.started_at as string | undefined) ?? null;
  const kills = killNeeds({ live: model.live, daily, adNames: new Map(ads.map((a) => [a.adId, a.name])), answers, lastPullAt: okPullAt, money, now });
  const unmappedItems = unmappedNeeds(model.unmapped, new Map(adsRows.map((a) => [a.ad_id, a.first_seen])), now);
  return { status, lastPull: (lastPull.data as LastPull) ?? null, d3Min, model, noMoney: false as const, hasData: ads.length > 0, kills, unmappedItems };
}

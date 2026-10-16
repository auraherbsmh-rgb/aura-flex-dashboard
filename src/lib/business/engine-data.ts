// Server only: everything Business · Creative engine reads (founders).
import { createClient } from "@/lib/supabase/server";
import { allRows, getBoardExtras, getEditRounds, getProductions, getResults, getTasks } from "@/lib/tasks";
import { getCurrentMoney } from "@/lib/settings/data";
import { buildLibrary } from "@/lib/library-shared";
import { buildEngine, type CostParts, type StateLog } from "@/lib/engine-shared";
import { ownerOf } from "@/lib/meta-shared";

export async function getEngineData(now: number) {
  const supabase = await createClient();
  const since = new Date(now - 91 * 864e5 + 36e5).toISOString().slice(0, 10);
  type D = { ad_id: string; day: string; spend: number; purchases: number };
  const [tasks, productions, editRounds, results, money, logRows, people, pay, ads, days, vars] = await Promise.all([
    getTasks(), getProductions(), getEditRounds(), getResults(), getCurrentMoney(),
    supabase.from("concept_state_log").select("task_id, state, live, at").order("at").order("live", { ascending: false }),
    supabase.from("people").select("id, role, active"),
    supabase.from("people_pay").select("person_id, pay_amount_tnd, pay_unit"),
    allRows<{ ad_id: string; name: string; campaign_id: string }>("Meta ads", (a, b) => supabase.from("meta_ads").select("ad_id, name, campaign_id").order("ad_id").range(a, b) as unknown as PromiseLike<{ data: { ad_id: string; name: string; campaign_id: string }[] | null; error: unknown }>),
    allRows<D>("Meta results", (a, b) => supabase.from("meta_daily").select("ad_id, day, spend, purchases").gte("day", since).order("ad_id").order("day").range(a, b) as unknown as PromiseLike<{ data: D[] | null; error: unknown }>),
    supabase.from("ad_variations").select("task_id, v, ad_name").eq("active", true),
  ]);
  const extras = await getBoardExtras(tasks);
  const lib = buildLibrary(tasks, Object.fromEntries(extras.details), Object.fromEntries(productions), editRounds, now, results);
  const log: StateLog[] = (logRows.data ?? []).map((r) => ({ taskId: r.task_id as string, state: r.state as string, live: r.live !== false, at: r.at as string }));

  // Engine cost per month from Settings → People and pay (copywriters per month or per script approved).
  const roleOf = new Map((people.data ?? []).filter((p) => p.active).map((p) => [p.id as string, p.role as string]));
  const sum = (role: string, unit: string) => (pay.data ?? []).filter((p) => roleOf.get(p.person_id as string) === role && p.pay_unit === unit).reduce((n, p) => n + Number(p.pay_amount_tnd ?? 0), 0);
  const missingCw = (pay.data ?? []).filter((p) => roleOf.get(p.person_id as string) === "copywriter" && p.pay_amount_tnd === null).length;
  const perVideo = (pay.data ?? []).filter((p) => roleOf.get(p.person_id as string) === "editor" && p.pay_unit === "per_video" && p.pay_amount_tnd !== null).map((p) => Number(p.pay_amount_tnd));
  // Per-script rates for every copywriter, active or not (approvals in the period by someone since deactivated still cost).
  const roleAll = new Map((people.data ?? []).map((p) => [p.id as string, p.role as string]));
  const cwPer = Object.fromEntries((pay.data ?? []).filter((p) => roleAll.get(p.person_id as string) === "copywriter" && p.pay_unit === "per_script" && p.pay_amount_tnd !== null).map((p) => [p.person_id as string, Number(p.pay_amount_tnd)]));
  const cost: CostParts = {
    copywriters: sum("copywriter", "per_month"), copywriterPerScript: cwPer,
    agency: sum("agency", "per_month"), strategist: sum("strategist", "per_month"),
    editingPerVideo: perVideo.length ? perVideo.reduce((a, b) => a + b, 0) / perVideo.length : 100,
    copywritersNote: missingCw ? ` (pay to fill for ${missingCw})` : "",
  };

  // What each dashboard concept earned in the period (Meta purchases × line − spend), for the engine's return.
  const generated = new Map((vars.data ?? []).map((v) => [String(v.ad_name).trim().toLowerCase(), { taskId: v.task_id as string, v: v.v as number }]));
  const taskOfAd = new Map<string, string>();
  for (const a of ads) { const o = ownerOf(a.name, generated, new Map()); if (o.kind === "task") taskOfAd.set(a.ad_id, o.taskId); }
  const money4w = new Map<string, { sales: number; spendUsd: number }>(), money3m = new Map<string, { sales: number; spendUsd: number }>();
  const cut4w = new Date(now - 28 * 864e5 + 36e5).toISOString().slice(0, 10);
  for (const d of days) {
    const id = taskOfAd.get(d.ad_id);
    if (!id) continue;
    for (const [m, ok] of [[money3m, true], [money4w, d.day >= cut4w]] as const) {
      if (!ok) continue;
      const x = m.get(id) ?? { sales: 0, spendUsd: 0 };
      x.sales += d.purchases; x.spendUsd += Number(d.spend);
      m.set(id, x);
    }
  }
  const launchedAt = new Map([...productions.entries()].map(([id, p]) => [id, p.launchedAt ?? p.liveAt ?? null]));
  const line = money ? Number(money.business_line_usd) : 0, rate = money ? Number(money.exchange_rate) : 3.35;
  // Margin per Meta purchase before ads and before fixed costs: the business line + fixed costs spread over the last
  // 30 days' Meta purchases (File 1: the line already carries the fixed costs per purchase).
  const cut30 = new Date(now - 30 * 864e5 + 36e5).toISOString().slice(0, 10);
  const purchases30 = days.filter((d) => d.day >= cut30).reduce((n, d) => n + d.purchases, 0);
  const fixed = money ? Number(money.fixed_costs_tnd) : 0;
  const marginUsd = line + (purchases30 ? fixed / rate / purchases30 : 0);
  const base = { now, tasks, lib, results, editRounds, launchedAt, log, cost, marginUsd, rate, hasMeta: days.length > 0 };
  return {
    w4: buildEngine({ ...base, period: "4w", winnersMoney: money4w }),
    m3: buildEngine({ ...base, period: "3m", winnersMoney: money3m }),
    hasMeta: days.length > 0,
  };
}

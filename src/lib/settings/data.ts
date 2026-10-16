import { metaStatus } from "@/lib/meta/pull";
import { createClient } from "@/lib/supabase/server";
import type { MoneyInputs } from "@/lib/money";

export type MoneyRow = {
  id: string;
  month: string;
  status: "provisional" | "final";
  business_line_usd: number;
  roas_line: number;
  aov_band_low_usd: number;
  aov_band_high_usd: number;
  exchange_rate: number;
  fixed_costs_tnd: number;
  kill_table_usd: number[];
  bottle_cost_tnd: number;
  delivery_cost_tnd: number;
  fixed_per_order_tnd: number;
  bridge_factor: number;
  door_rate_1b: number;
  door_rate_2b: number;
  door_rate_3b: number;
  door_rate_avg: number;
  price_1b_tnd: number;
  price_2b_tnd: number;
  price_3b_tnd: number;
  ritual_on: string | null;
  next_ritual_on: string | null;
};

export type Rule = { key: string; grp: "copywriting" | "editing" | "live"; label: string; value: number | null; unit: string; sort: number };
export type Flag = { key: string; enabled: boolean; label: string };
export type ListItem = {
  id: string;
  list: "avatar" | "angle" | "hook_type" | "main_argument" | "format";
  code: string | null;
  label: string;
  status: "approved" | "on_hold" | "rejected" | "reserved" | "archived";
  track: "knee" | "hips" | "both" | null;
  sort: number;
};
export type Campaign = { campaign_id: string; name: string; track: "knee" | "hips"; kind: "ABO" | "CBO"; active: boolean };
export type Person = {
  id: string;
  display_name: string;
  role: "founder_1" | "founder_2" | "copywriter" | "editor" | "agency" | "strategist";
  email: string | null;
  does_ai_3d: boolean;
  active: boolean;
  has_login: boolean;
  pay_amount_tnd: number | null;
  pay_unit: "per_video" | "per_month" | "per_script" | null;
  rate_3d_tnd: number | null;
  weekly_target: number | null;
};
export type Level = { name_and_rule: string; bonus_tnd: number | null };

export function toMoneyInputs(r: MoneyRow): MoneyInputs {
  const n = Number;
  return {
    businessLineUsd: n(r.business_line_usd),
    aovBandLowUsd: n(r.aov_band_low_usd),
    aovBandHighUsd: n(r.aov_band_high_usd),
    exchangeRate: n(r.exchange_rate),
    killTableUsd: r.kill_table_usd.map(n),
    bottleCostTnd: n(r.bottle_cost_tnd),
    deliveryCostTnd: n(r.delivery_cost_tnd),
    fixedPerOrderTnd: n(r.fixed_per_order_tnd),
    bridgeFactor: n(r.bridge_factor),
    doorRate1b: n(r.door_rate_1b),
    doorRate2b: n(r.door_rate_2b),
    doorRate3b: n(r.door_rate_3b),
    doorRateAvg: n(r.door_rate_avg),
    price1bTnd: n(r.price_1b_tnd),
    price2bTnd: n(r.price_2b_tnd),
    price3bTnd: n(r.price_3b_tnd),
  };
}

/** The money row in force: the latest closed month. */
export async function getCurrentMoney(): Promise<MoneyRow | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("money_settings").select("*").order("month", { ascending: false }).limit(1).maybeSingle();
  return (data as MoneyRow | null) ?? null;
}

/** Everything the Settings screen shows, in one round of parallel reads. */
export async function getSettings() {
  const supabase = await createClient();
  const [money, rules, flags, lists, campaigns, people, pay, levels] = await Promise.all([
    supabase.from("money_settings").select("*").order("month", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("alert_rules").select("key, grp, label, value, unit, sort").order("sort"),
    supabase.from("app_flags").select("key, enabled, label").order("key", { ascending: false }),
    supabase.from("list_items").select("id, list, code, label, status, track, sort").order("sort"),
    supabase.from("campaign_scope").select("campaign_id, name, track, kind, active").order("track").order("kind"),
    supabase.from("people").select("id, display_name, role, email, does_ai_3d, active, auth_user_id, created_at").order("created_at"),
    supabase.from("people_pay").select("person_id, pay_amount_tnd, pay_unit, rate_3d_tnd, weekly_target"),
    supabase.from("copywriter_level_set").select("levels").eq("id", 1).maybeSingle(),
  ]);
  const [mapStart, lastSync] = await Promise.all([
    supabase.from("app_dates").select("value").eq("key", "map_start").maybeSingle(),
    supabase.from("meta_sync").select("started_at, finished_at, ok, message").order("id", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const payBy = new Map((pay.data ?? []).map((p) => [p.person_id as string, p]));
  const roleOrder = ["founder_1", "founder_2", "copywriter", "editor", "agency", "strategist"];
  const peopleRows: Person[] = (people.data ?? [])
    .map((p) => {
      const pp = payBy.get(p.id);
      return {
        id: p.id,
        display_name: p.display_name,
        role: p.role,
        email: p.email,
        does_ai_3d: p.does_ai_3d,
        active: p.active,
        has_login: p.auth_user_id !== null,
        pay_amount_tnd: pp?.pay_amount_tnd ?? null,
        pay_unit: pp?.pay_unit ?? null,
        rate_3d_tnd: pp?.rate_3d_tnd ?? null,
        weekly_target: pp?.weekly_target ?? null,
      } as Person;
    })
    .sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));

  return {
    mapStart: (mapStart.data?.value as string | null) ?? null,
    meta: { ...metaStatus(), last: (lastSync.data as { started_at: string; finished_at: string | null; ok: boolean | null; message: string | null } | null) ?? null },
    money: (money.data as MoneyRow | null) ?? null,
    rules: (rules.data ?? []) as Rule[],
    flags: (flags.data ?? []) as Flag[],
    lists: (lists.data ?? []) as ListItem[],
    campaigns: (campaigns.data ?? []) as Campaign[],
    people: peopleRows,
    levels: ((levels.data?.levels ?? []) as Level[]),
  };
}

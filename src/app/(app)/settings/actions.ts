"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer, type Viewer } from "@/lib/viewer";
import { parseNumber, parseRate, text, toNameCode } from "@/lib/parse";

// Every change below is written to the step log by a database trigger (private.log_change),
// so a save can never succeed without its log row.

export type ActionState = { ok?: string; error?: string; at?: number };

const done = (ok: string): ActionState => ({ ok, at: Date.now() });
const fail = (error: string): ActionState => ({ error, at: Date.now() });

/** Settings is founders only (handoff §12). The database enforces it too; this gives a clear message. */
async function founder(): Promise<Viewer | null> {
  const v = await getViewer();
  return v.role === "founder_1" || v.role === "founder_2" ? v : null;
}

const isBad = (n: number | null) => n !== null && (Number.isNaN(n) || n < 0);

// ─────────────────────────────── Money ───────────────────────────────

const LABELS: Record<string, string> = {
  business_line_usd: "business line",
  roas_line: "ROAS line",
  aov_band_low_usd: "AOV band low",
  aov_band_high_usd: "AOV band high",
  exchange_rate: "exchange rate",
  fixed_costs_tnd: "fixed costs",
  bottle_cost_tnd: "bottle cost",
  delivery_cost_tnd: "delivery cost",
  fixed_per_order_tnd: "fixed cost per order",
  bridge_factor: "delivered per Meta purchase",
  door_rate_1b: "door rate 1 bottle",
  door_rate_2b: "door rate 2 bottles",
  door_rate_3b: "door rate 3 bottles",
  door_rate_avg: "door rate average",
};

/**
 * Saves one closed month's numbers. Saving a month that already exists replaces it, and the database keeps
 * the previous version (money_settings_history) plus a step-log row listing every value that changed.
 */
export async function saveMoney(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");

  const month = text(form.get("month")); // YYYY-MM
  if (!/^\d{4}-\d{2}$/.test(month)) return fail("Pick the closed month these numbers come from.");

  const num = (k: string) => parseNumber(form.get(k));
  const rate = (k: string) => parseRate(form.get(k));
  const fields = {
    business_line_usd: num("business_line_usd"),
    roas_line: num("roas_line"),
    aov_band_low_usd: num("aov_band_low_usd"),
    aov_band_high_usd: num("aov_band_high_usd"),
    exchange_rate: num("exchange_rate"),
    fixed_costs_tnd: num("fixed_costs_tnd"),
    bottle_cost_tnd: num("bottle_cost_tnd"),
    delivery_cost_tnd: num("delivery_cost_tnd"),
    fixed_per_order_tnd: num("fixed_per_order_tnd"),
    bridge_factor: num("bridge_factor"),
    door_rate_1b: rate("door_rate_1b"),
    door_rate_2b: rate("door_rate_2b"),
    door_rate_3b: rate("door_rate_3b"),
    door_rate_avg: rate("door_rate_avg"),
  };
  const missing = Object.entries(fields).filter(([, n]) => n === null || Number.isNaN(n) || (n as number) <= 0);
  if (missing.length) return fail(`Check these numbers: ${missing.map(([k]) => LABELS[k] ?? k).join(", ")}.`);
  if ((fields.aov_band_low_usd as number) >= (fields.aov_band_high_usd as number)) return fail("AOV band: the low end must be under the high end.");
  for (const k of ["door_rate_1b", "door_rate_2b", "door_rate_3b", "door_rate_avg", "bridge_factor"] as const) {
    if ((fields[k] as number) > 1) return fail(`${LABELS[k]} must be a share of 100%.`);
  }

  const kill = Array.from({ length: 10 }, (_, i) => parseNumber(form.get(`kill_${i}`)));
  if (kill.some((k) => k === null || Number.isNaN(k) || (k as number) <= 0)) return fail("Fill every kill-table box (0 to 9 sales).");
  for (let i = 1; i < 10; i++) {
    if ((kill[i] as number) <= (kill[i - 1] as number)) return fail(`Kill table: ${i} sales must be higher than ${i - 1} sales.`);
  }

  const status = text(form.get("status")) === "provisional" ? "provisional" : "final";
  const row = {
    month: `${month}-01`,
    status,
    ...fields,
    kill_table_usd: kill,
    ritual_on: text(form.get("ritual_on")) || null,
    next_ritual_on: text(form.get("next_ritual_on")) || null,
    updated_by: v.personId,
    updated_at: new Date().toISOString(),
  };

  const supabase = await createClient();
  const { data: existing } = await supabase.from("money_settings").select("id").eq("month", row.month).maybeSingle();
  const { error } = await supabase.from("money_settings").upsert(row, { onConflict: "month" });
  if (error) return fail(`Not saved: ${error.message}`);
  revalidatePath("/settings");
  return done(
    existing
      ? `${month} updated (${status}). The previous version is kept in the history.`
      : `Money numbers saved for ${month} (${status}).`,
  );
}

// ─────────────────────────────── People and pay ───────────────────────────────

const LOGIN_ROLES = ["founder_1", "founder_2", "copywriter", "editor"];
const ALL_ROLES = [...LOGIN_ROLES, "agency", "strategist"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const payUnitFor = (role: string) => (role === "editor" ? "per_video" : "per_month");

/** One "Save people" button for every row (Settings artboard). Fields are named `<field>__<person id>`. */
export async function savePeople(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  const ids = form.getAll("person_id").map(String);
  if (!ids.length) return fail("Nothing to save.");

  const supabase = await createClient();
  const [{ data: people }, { data: pays }] = await Promise.all([
    supabase.from("people").select("id, role, auth_user_id, display_name, does_ai_3d").in("id", ids),
    supabase.from("people_pay").select("person_id, pay_amount_tnd, rate_3d_tnd, weekly_target").in("person_id", ids),
  ]);
  const payBy = new Map((pays ?? []).map((p) => [p.person_id, p]));

  // Validate everything first, so a mistake in one row saves nothing.
  type Plan = { id: string; person: Record<string, unknown>; pay: Record<string, unknown> | null; name: string };
  const plans: Plan[] = [];
  for (const p of people ?? []) {
    const get = (f: string) => form.get(`${f}__${p.id}`);
    const name = text(get("display_name"));
    if (!name) return fail("Every person needs a name.");
    const person: Record<string, unknown> = { display_name: name };
    if (LOGIN_ROLES.includes(p.role) && !p.auth_user_id) {
      const email = text(get("email")).toLowerCase();
      if (!EMAIL.test(email)) return fail(`${name}: enter a valid login email.`);
      person.email = email;
    }
    let ai = p.does_ai_3d;
    if (p.role === "editor") {
      ai = get("does_ai_3d") === "on";
      person.does_ai_3d = ai;
    }

    let pay: Record<string, unknown> | null = null;
    if (!p.role.startsWith("founder")) {
      const amount = parseNumber(get("pay_amount_tnd"));
      if (isBad(amount)) return fail(`${name}: pay must be a number of TND, 0 or more.`);
      const prev = payBy.get(p.id);
      pay = { person_id: p.id, pay_amount_tnd: amount, pay_unit: payUnitFor(p.role), updated_at: new Date().toISOString() };
      if (p.role === "copywriter") {
        const target = parseNumber(get("second"));
        if (isBad(target)) return fail(`${name}: the weekly target must be a number.`);
        pay.weekly_target = target;
      }
      if (p.role === "editor") {
        // The 3D rate box only shows for an AI / 3D editor; unticking keeps the saved rate.
        const rate = get("second") === null ? (prev?.rate_3d_tnd ?? null) : parseNumber(get("second"));
        if (isBad(rate)) return fail(`${name}: the 3D rate must be a number of TND, 0 or more.`);
        pay.rate_3d_tnd = rate;
      }
    }
    plans.push({ id: p.id, person, pay, name });
  }

  for (const plan of plans) {
    const { error } = await supabase.from("people").update(plan.person).eq("id", plan.id);
    if (error) return fail(error.message.includes("lower") ? `${plan.name}: that email is already used by someone else.` : `${plan.name} not saved: ${error.message}`);
    if (plan.pay) {
      const { error: payErr } = await supabase.from("people_pay").upsert(plan.pay, { onConflict: "person_id" });
      if (payErr) return fail(`${plan.name}: pay not saved (${payErr.message}).`);
    }
  }
  revalidatePath("/settings");
  return done("People saved.");
}

export async function addPerson(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  const name = text(form.get("display_name"));
  const role = text(form.get("role"));
  const email = text(form.get("email")).toLowerCase();
  const pay = parseNumber(form.get("pay_amount_tnd"));
  if (!name) return fail("A name is needed.");
  if (!ALL_ROLES.includes(role)) return fail("Pick a role.");
  if (LOGIN_ROLES.includes(role) && !EMAIL.test(email)) return fail("This role logs in: enter their email.");
  if (isBad(pay)) return fail("Pay must be a number of TND, 0 or more.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .insert({ display_name: name, role, email: LOGIN_ROLES.includes(role) ? email : null })
    .select("id")
    .single();
  if (error) return fail(error.message.includes("lower") ? "That email is already used by someone else." : `Not added: ${error.message}`);

  if (pay !== null && !role.startsWith("founder")) {
    const { error: payErr } = await supabase.from("people_pay").insert({ person_id: data.id, pay_amount_tnd: pay, pay_unit: payUnitFor(role) });
    if (payErr) return fail(`${name} added, but the pay was not saved (${payErr.message}). Fill it in the row.`);
  }
  revalidatePath("/settings");
  return done(LOGIN_ROLES.includes(role) ? `${name} added. They can now ask for a login link.` : `${name} added.`);
}

export async function setPersonActive(id: string, active: boolean): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  if (id === v.personId && !active) return fail("You can't switch yourself off.");
  const supabase = await createClient();
  const { error } = await supabase.from("people").update({ active }).eq("id", id);
  if (error) return fail(`Not saved: ${error.message}`);
  revalidatePath("/settings");
  return done(active ? "Switched back on." : "Switched off: no login, history kept.");
}

// ─────────────────────────────── Alerts and late rules ───────────────────────────────

/** All rules and both email switches in one statement each, so a save is all or nothing per table. */
export async function saveRules(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  const supabase = await createClient();
  const { data: rules, error: readErr } = await supabase.from("alert_rules").select("key, grp, label, unit, sort");
  if (readErr || !rules) return fail("Could not read the rules. Nothing was saved.");

  const now = new Date().toISOString();
  const rows = [];
  for (const r of rules) {
    const value = parseNumber(form.get(`rule_${r.key}`));
    if (Number.isNaN(value) || (value !== null && value <= 0)) return fail(`"${r.label}" needs a number above 0, or empty.`);
    rows.push({ ...r, value, updated_by: v.personId, updated_at: now });
  }
  const { error } = await supabase.from("alert_rules").upsert(rows, { onConflict: "key" });
  if (error) return fail(`Not saved: ${error.message}`);

  const { data: flags } = await supabase.from("app_flags").select("key, label");
  const flagRows = (flags ?? []).map((f) => ({ ...f, enabled: form.get(`flag_${f.key}`) === "on", updated_by: v.personId, updated_at: now }));
  if (flagRows.length) {
    const { error: flagErr } = await supabase.from("app_flags").upsert(flagRows, { onConflict: "key" });
    if (flagErr) return fail(`Rules saved, but the email switches were not (${flagErr.message}).`);
  }
  revalidatePath("/settings");
  return done("Alert rules saved.");
}

// ─────────────────────────────── Lists ───────────────────────────────

const LISTS = ["avatar", "angle", "hook_type", "main_argument", "format"];
const CODED = ["avatar", "angle", "format"];

export async function addListItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  const list = text(form.get("list"));
  const typed = text(form.get("label"));
  if (!LISTS.includes(list)) return fail("Unknown list.");
  if (!typed) return fail("Type a name first.");

  let code: string | null = null;
  if (CODED.includes(list)) {
    code = list === "angle" ? toNameCode(typed) : toNameCode(text(form.get("code")) || typed).toUpperCase().replace(/-/g, "");
    if (!code) return fail("The name needs letters or numbers.");
  }
  const label = list === "angle" ? (code as string) : typed;
  const track = list === "angle" ? (["knee", "hips", "both"].includes(text(form.get("track"))) ? text(form.get("track")) : "both") : null;

  const supabase = await createClient();
  // Already there (maybe removed earlier)? Bring it back instead of failing.
  const { data: same } = await supabase
    .from("list_items")
    .select("id, label, code, status, archived_from")
    .eq("list", list);
  const match = (same ?? []).find(
    (i) => i.label.toLowerCase() === label.toLowerCase() || (code && i.code?.toLowerCase() === code.toLowerCase()),
  );
  if (match) {
    if (match.status !== "archived") return fail(`${match.label} is already in this list.`);
    const { error } = await supabase.from("list_items").update({ status: match.archived_from ?? "approved", archived_from: null }).eq("id", match.id);
    if (error) return fail(`Not restored: ${error.message}`);
    revalidatePath("/settings");
    return done(`${match.label} is back in the list.`);
  }

  const { data: last } = await supabase.from("list_items").select("sort").eq("list", list).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase
    .from("list_items")
    .insert({ list, label, code, track, sort: (last?.sort ?? 0) + 1, created_by: v.personId });
  if (error) return fail(error.code === "23505" ? "Already in this list." : `Not added: ${error.message}`);
  revalidatePath("/settings");
  return done(code && list === "angle" && code !== typed ? `Added as ${code} (the name used in ad names).` : "Added.");
}

/** "×" never deletes: old ad names and history still point at the item. It is archived and can be restored as it was. */
export async function archiveListItem(id: string): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  const supabase = await createClient();
  const { data: item } = await supabase.from("list_items").select("status").eq("id", id).maybeSingle();
  if (!item) return fail("Item not found.");
  if (item.status === "archived") return done("Already removed.");
  const { error } = await supabase.from("list_items").update({ status: "archived", archived_from: item.status }).eq("id", id);
  if (error) return fail(`Not saved: ${error.message}`);
  revalidatePath("/settings");
  return done("Removed from pickers. Past ads keep their name.");
}

export async function restoreListItem(id: string): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  const supabase = await createClient();
  const { data: item } = await supabase.from("list_items").select("archived_from").eq("id", id).maybeSingle();
  if (!item) return fail("Item not found.");
  const { error } = await supabase.from("list_items").update({ status: item.archived_from ?? "approved", archived_from: null }).eq("id", id);
  if (error) return fail(`Not restored: ${error.message}`);
  revalidatePath("/settings");
  return done("Back in the list.");
}

// ─────────────────────────────── Campaigns in scope ───────────────────────────────

export async function addCampaign(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  const campaign_id = text(form.get("campaign_id"));
  const name = text(form.get("name"));
  const track = text(form.get("track"));
  const kind = text(form.get("kind"));
  if (!/^\d{10,}$/.test(campaign_id)) return fail("Campaign ID = the long number from Ads Manager.");
  if (!name || !["knee", "hips"].includes(track) || !["ABO", "CBO"].includes(kind)) return fail("Fill name, track and ABO/CBO.");
  const supabase = await createClient();
  const { error } = await supabase.from("campaign_scope").insert({ campaign_id, name, track, kind, updated_by: v.personId });
  if (error) return fail(error.code === "23505" ? "This campaign is already in scope." : `Not added: ${error.message}`);
  revalidatePath("/settings");
  return done(`${name} is now in scope.`);
}

export async function setCampaignActive(campaignId: string, active: boolean): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("campaign_scope")
    .update({ active, updated_by: v.personId, updated_at: new Date().toISOString() })
    .eq("campaign_id", campaignId);
  if (error) return fail(`Not saved: ${error.message}`);
  revalidatePath("/settings");
  return done(active ? "Back in scope." : "Out of scope: the Meta pull will skip its ads.");
}

// ─────────────────────────────── Copywriter levels ───────────────────────────────

/**
 * Saves the levels exactly as shown: level i = name box i + bonus box i. A level whose name and bonus are
 * both empty is removed; a bonus without a name is refused. The list is one row, saved in one statement.
 */
export async function saveLevels(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  const names = form.getAll("level").map((x) => String(x).trim());
  const bonusesRaw = form.getAll("bonus");

  const rows: { name_and_rule: string; bonus_tnd: number | null }[] = [];
  for (let i = 0; i < names.length; i++) {
    const bonus = parseNumber(bonusesRaw[i]);
    if (isBad(bonus)) return fail(`Level ${i + 1}: the bonus must be a number of TND, 0 or more.`);
    if (!names[i] && bonus !== null) return fail(`Level ${i + 1}: give it a name and rule, or clear its bonus.`);
    if (!names[i]) continue;
    rows.push({ name_and_rule: names[i], bonus_tnd: bonus });
  }

  const supabase = await createClient();
  const levels = rows.map((r) => ({ name_and_rule: r.name_and_rule, bonus_tnd: r.bonus_tnd }));
  const { error } = await supabase
    .from("copywriter_level_set")
    .upsert({ id: 1, levels, updated_by: v.personId, updated_at: new Date().toISOString() }, { onConflict: "id" });
  if (error) return fail(`Not saved: ${error.message}`);
  revalidatePath("/settings");
  return done(rows.length ? `${rows.length} level${rows.length > 1 ? "s" : ""} saved as a draft.` : "Levels cleared.");
}

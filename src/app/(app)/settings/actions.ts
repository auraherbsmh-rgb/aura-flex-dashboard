"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getViewer, type Viewer } from "@/lib/viewer";
import { logStep } from "@/lib/steplog";
import { parseNumber, parseRate, text, toNameCode } from "@/lib/parse";

export type ActionState = { ok?: string; error?: string; at?: number };

const done = (ok: string): ActionState => ({ ok, at: Date.now() });
const fail = (error: string): ActionState => ({ error, at: Date.now() });

/** Settings is founders only (handoff §12). The database enforces it too; this gives a clear message. */
async function founder(): Promise<Viewer | null> {
  const v = await getViewer();
  return v.role === "founder_1" || v.role === "founder_2" ? v : null;
}

// ─────────────────────────────── Money ───────────────────────────────

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
  const { data, error } = await supabase.from("money_settings").upsert(row, { onConflict: "month" }).select("id").single();
  if (error) return fail(`Not saved: ${error.message}`);
  await logStep(v.personId, "money_settings", data.id, "save", { month: row.month, status, business_line_usd: row.business_line_usd });
  revalidatePath("/settings");
  return done(`Money numbers saved for ${month} (${status}).`);
}

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

// ─────────────────────────────── People and pay ───────────────────────────────

const LOGIN_ROLES = ["founder_1", "founder_2", "copywriter", "editor"];
const ALL_ROLES = [...LOGIN_ROLES, "agency", "strategist"];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function payUnitFor(role: string) {
  return role === "editor" ? "per_video" : role === "copywriter" ? "per_month" : "per_month";
}

export async function savePerson(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  const id = text(form.get("id"));
  const supabase = await createClient();
  const { data: person } = await supabase.from("people").select("id, role, email, auth_user_id, display_name").eq("id", id).maybeSingle();
  if (!person) return fail("Person not found.");

  const name = text(form.get("display_name"));
  if (!name) return fail("A name is needed.");
  const updates: Record<string, unknown> = { display_name: name };

  if (LOGIN_ROLES.includes(person.role) && !person.auth_user_id) {
    const email = text(form.get("email")).toLowerCase();
    if (!EMAIL.test(email)) return fail("Enter a valid email for this login.");
    updates.email = email;
  }
  if (person.role === "editor") updates.does_ai_3d = form.get("does_ai_3d") === "on";

  const pay = parseNumber(form.get("pay_amount_tnd"));
  const second = parseNumber(form.get("second"));
  if (Number.isNaN(pay) || Number.isNaN(second)) return fail("Pay boxes take numbers only (TND).");

  const { error } = await supabase.from("people").update(updates).eq("id", id);
  if (error) return fail(error.message.includes("lower") ? "That email is already used by someone else." : `Not saved: ${error.message}`);

  if (!person.role.startsWith("founder")) {
    const payRow = {
      person_id: id,
      pay_amount_tnd: pay,
      pay_unit: payUnitFor(person.role),
      weekly_target: person.role === "copywriter" ? second : null,
      rate_3d_tnd: person.role === "editor" ? second : null,
      updated_at: new Date().toISOString(),
    };
    const { error: payErr } = await supabase.from("people_pay").upsert(payRow, { onConflict: "person_id" });
    if (payErr) return fail(`Pay not saved: ${payErr.message}`);
  }
  await logStep(v.personId, "person", id, "save", { name });
  revalidatePath("/settings");
  return done(`${name} saved.`);
}

export async function addPerson(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  const name = text(form.get("display_name"));
  const role = text(form.get("role"));
  const email = text(form.get("email")).toLowerCase();
  if (!name) return fail("A name is needed.");
  if (!ALL_ROLES.includes(role)) return fail("Pick a role.");
  if (LOGIN_ROLES.includes(role) && !EMAIL.test(email)) return fail("This role logs in: enter their email.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("people")
    .insert({ display_name: name, role, email: LOGIN_ROLES.includes(role) ? email : null })
    .select("id")
    .single();
  if (error) return fail(error.message.includes("lower") ? "That email is already used by someone else." : `Not added: ${error.message}`);

  const pay = parseNumber(form.get("pay_amount_tnd"));
  if (pay !== null && !Number.isNaN(pay) && !role.startsWith("founder")) {
    await supabase.from("people_pay").insert({ person_id: data.id, pay_amount_tnd: pay, pay_unit: payUnitFor(role) });
  }
  await logStep(v.personId, "person", data.id, "add", { name, role });
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
  await logStep(v.personId, "person", id, active ? "reactivate" : "deactivate");
  revalidatePath("/settings");
  return done(active ? "Switched back on." : "Switched off: no login, history kept.");
}

// ─────────────────────────────── Alerts and late rules ───────────────────────────────

export async function saveRules(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  const supabase = await createClient();
  const { data: rules } = await supabase.from("alert_rules").select("key, label");
  for (const r of rules ?? []) {
    const value = parseNumber(form.get(`rule_${r.key}`));
    if (Number.isNaN(value) || (value !== null && value <= 0)) return fail(`"${r.label}" needs a number above 0, or empty.`);
    const { error } = await supabase
      .from("alert_rules")
      .update({ value, updated_by: v.personId, updated_at: new Date().toISOString() })
      .eq("key", r.key);
    if (error) return fail(`Not saved: ${error.message}`);
  }
  for (const key of ["email_instant", "email_digest"]) {
    await supabase
      .from("app_flags")
      .update({ enabled: form.get(`flag_${key}`) === "on", updated_by: v.personId, updated_at: new Date().toISOString() })
      .eq("key", key);
  }
  await logStep(v.personId, "alert_rules", null, "save");
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
  const label = text(form.get("label"));
  if (!LISTS.includes(list)) return fail("Unknown list.");
  if (!label) return fail("Type a name first.");

  let code: string | null = null;
  if (CODED.includes(list)) {
    code = list === "angle" ? toNameCode(label) : toNameCode(text(form.get("code")) || label).toUpperCase().replace(/-/g, "");
    if (!code) return fail("The name needs letters or numbers.");
  }
  const track = list === "angle" ? (["knee", "hips", "both"].includes(text(form.get("track"))) ? text(form.get("track")) : "both") : null;

  const supabase = await createClient();
  const { data: last } = await supabase.from("list_items").select("sort").eq("list", list).order("sort", { ascending: false }).limit(1).maybeSingle();
  const { data, error } = await supabase
    .from("list_items")
    .insert({ list, label: list === "angle" ? (code as string) : label, code, track, sort: (last?.sort ?? 0) + 1, created_by: v.personId })
    .select("id")
    .single();
  if (error) return fail(error.code === "23505" ? "Already in this list." : `Not added: ${error.message}`);
  await logStep(v.personId, "list_item", data.id, "add", { list, label, code });
  revalidatePath("/settings");
  return done(code && list === "angle" ? `Added as ${code} (the name used in ad names).` : "Added.");
}

/** "×" never deletes: old ad names and history still point at the item, so it is archived. */
export async function setListItemStatus(id: string, status: "approved" | "archived"): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  const supabase = await createClient();
  const { error } = await supabase.from("list_items").update({ status }).eq("id", id);
  if (error) return fail(`Not saved: ${error.message}`);
  await logStep(v.personId, "list_item", id, status === "archived" ? "archive" : "restore");
  revalidatePath("/settings");
  return done(status === "archived" ? "Removed from pickers. Past ads keep their name." : "Back in the pickers.");
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
  await logStep(v.personId, "campaign_scope", null, "add", { campaign_id, name, track, kind });
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
  await logStep(v.personId, "campaign_scope", null, active ? "include" : "exclude", { campaign_id: campaignId });
  revalidatePath("/settings");
  return done(active ? "Back in scope." : "Out of scope: its ads are no longer read.");
}

// ─────────────────────────────── Copywriter levels ───────────────────────────────

export async function saveLevels(_prev: ActionState, form: FormData): Promise<ActionState> {
  const v = await founder();
  if (!v) return fail("Only founders can change Settings.");
  const rows = form
    .getAll("level")
    .map((x) => String(x).trim())
    .filter(Boolean);
  const bonuses = form.getAll("bonus").map((x) => parseNumber(x));
  const supabase = await createClient();
  const { data: existing } = await supabase.from("copywriter_levels").select("id").order("sort");
  // Rewrite in order: update the first N, add the rest. Empty boxes leave a level unchanged.
  for (let i = 0; i < rows.length; i++) {
    const bonus = bonuses[i] !== undefined && !Number.isNaN(bonuses[i]) ? bonuses[i] : null;
    const id = existing?.[i]?.id;
    const values = { sort: i + 1, name_and_rule: rows[i], bonus_tnd: bonus, updated_at: new Date().toISOString() };
    const { error } = id
      ? await supabase.from("copywriter_levels").update(values).eq("id", id)
      : await supabase.from("copywriter_levels").insert(values);
    if (error) return fail(`Not saved: ${error.message}`);
  }
  await logStep(v.personId, "copywriter_levels", null, "save", { count: rows.length });
  revalidatePath("/settings");
  return done(rows.length ? "Levels saved as a draft." : "Nothing to save yet.");
}

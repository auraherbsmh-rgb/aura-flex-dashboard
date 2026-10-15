"use client";

import { startTransition, useActionState, useState, useTransition, type FormEvent } from "react";
import {
  saveMoney,
  savePeople,
  addPerson,
  setPersonActive,
  saveRules,
  addListItem,
  archiveListItem,
  restoreListItem,
  addCampaign,
  setCampaignActive,
  saveLevels,
  type ActionState,
} from "./actions";
import { ownLineForBottles, type MoneyInputs } from "@/lib/money";
import { parseNumber, parseRate } from "@/lib/parse";
import type { Campaign, Flag, Level, ListItem, MoneyRow, Person, Rule } from "@/lib/settings/data";

const empty: ActionState = {};

/**
 * Submit without React's automatic form reset. With `action={...}` React 19 clears an edit form back to its
 * first values after saving, so the founder saw the old number again although it was saved. Edit forms use this.
 */
function keepValues(action: (fd: FormData) => void) {
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => action(fd));
  };
}

function Msg({ state }: { state: ActionState }) {
  if (state.error) return <span className="formmsg err" role="alert">{state.error}</span>;
  if (state.ok) return <span className="formmsg ok" role="status">{state.ok}</span>;
  return null;
}

const usd = (n: number | null | undefined) => (n === null || n === undefined ? "" : `$${Number(n).toFixed(2).replace(/\.00$/, "")}`);
const pct = (n: number | null | undefined) => (n === null || n === undefined ? "" : `${(Number(n) * 100).toFixed(1)}%`);
const plain = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(Number(n)));
const thousands = (n: number | null | undefined) => (n === null || n === undefined ? "" : Number(n).toLocaleString("en-US"));

function Field({ label, name, value, unit, mode = "decimal" }: { label: string; name: string; value: string; unit?: string; mode?: "decimal" | "text" }) {
  return (
    <label className="f">
      <span className="lbl">{label}</span>
      <input className={value ? "fi" : "fi fi-empty"} name={name} defaultValue={value} inputMode={mode} placeholder="to fill" autoComplete="off" />
      <span className="unit">{unit ?? " "}</span>
    </label>
  );
}

// ─────────────────────────────── Money ───────────────────────────────

export function MoneyForm({ money }: { money: MoneyRow | null }) {
  const [state, action, pending] = useActionState(saveMoney, empty);
  const m = money;
  // Live own-line preview from what is typed, so the founder sees the effect before saving.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const val = (k: keyof MoneyRow, fmt: (n: number) => string) => (m ? fmt(Number(m[k])) : "");
  const read = (k: string, fallback: number | undefined, rate = false) => {
    if (draft[k] === undefined) return fallback;
    const n = rate ? parseRate(draft[k]) : parseNumber(draft[k]);
    return n === null || Number.isNaN(n) ? undefined : n;
  };
  const inputs: Partial<MoneyInputs> = {
    exchangeRate: read("exchange_rate", m ? Number(m.exchange_rate) : undefined),
    bottleCostTnd: read("bottle_cost_tnd", m ? Number(m.bottle_cost_tnd) : undefined),
    deliveryCostTnd: read("delivery_cost_tnd", m ? Number(m.delivery_cost_tnd) : undefined),
    fixedPerOrderTnd: read("fixed_per_order_tnd", m ? Number(m.fixed_per_order_tnd) : undefined),
    bridgeFactor: read("bridge_factor", m ? Number(m.bridge_factor) : undefined),
    doorRate1b: read("door_rate_1b", m ? Number(m.door_rate_1b) : undefined, true),
    doorRate2b: read("door_rate_2b", m ? Number(m.door_rate_2b) : undefined, true),
    doorRate3b: read("door_rate_3b", m ? Number(m.door_rate_3b) : undefined, true),
    doorRateAvg: read("door_rate_avg", m ? Number(m.door_rate_avg) : undefined, true),
    price1bTnd: m ? Number(m.price_1b_tnd) : 59,
    price2bTnd: m ? Number(m.price_2b_tnd) : 90,
    price3bTnd: m ? Number(m.price_3b_tnd) : 129,
  };
  const complete = Object.values(inputs).every((x) => typeof x === "number" && x > 0);
  const own = (b: 1 | 2 | 3) => (complete ? `$${ownLineForBottles(b, inputs as MoneyInputs).toFixed(2)}` : "—");

  return (
    <form onSubmit={keepValues(action)} onChange={(e) => {
      const t = e.target as unknown as HTMLInputElement;
      if (t.name) setDraft((d) => ({ ...d, [t.name]: t.value }));
    }} style={{ display: "contents" }}>
      <div className="fg fg-4 fg-dates">
        <label className="f">
          <span className="lbl">Numbers from closed month</span>
          <input className="fi" type="month" name="month" defaultValue={m ? m.month.slice(0, 7) : ""} required />
          <span className="unit">the month the ritual closed</span>
        </label>
        <label className="f">
          <span className="lbl">Close</span>
          <select className="fi" name="status" defaultValue={m?.status ?? "final"}>
            <option value="final">Final</option>
            <option value="provisional">Provisional (orders still open)</option>
          </select>
          <span className="unit">&nbsp;</span>
        </label>
        <label className="f">
          <span className="lbl">Ritual done on</span>
          <input className="fi" type="date" name="ritual_on" defaultValue={m?.ritual_on ?? ""} />
          <span className="unit">&nbsp;</span>
        </label>
        <label className="f">
          <span className="lbl">Next ritual</span>
          <input className="fi" type="date" name="next_ritual_on" defaultValue={m?.next_ritual_on ?? ""} />
          <span className="unit">first Monday of the month</span>
        </label>
      </div>

      <div className="fg fg-5">
        <Field label="Business line" name="business_line_usd" value={val("business_line_usd", usd)} unit="Meta CPA" />
        <Field label="ROAS line" name="roas_line" value={val("roas_line", plain)} />
        <label className="f">
          <span className="lbl">AOV band</span>
          <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <input className="fi" name="aov_band_low_usd" defaultValue={val("aov_band_low_usd", usd)} inputMode="decimal" aria-label="AOV band low" />
            <span aria-hidden="true">–</span>
            <input className="fi" name="aov_band_high_usd" defaultValue={val("aov_band_high_usd", usd)} inputMode="decimal" aria-label="AOV band high" />
          </span>
          <span className="unit">ROAS health check</span>
        </label>
        <Field label="Exchange rate" name="exchange_rate" value={val("exchange_rate", plain)} unit="TND per USD" />
        <Field label="Fixed costs" name="fixed_costs_tnd" value={val("fixed_costs_tnd", thousands)} unit="TND / month" />
      </div>

      <div>
        <div className="lbl" style={{ marginBottom: 8 }}>Kill table · spend at which a variation with this many sales is killed</div>
        <div className="fg fg-10">
          {Array.from({ length: 10 }, (_, i) => (
            <Field key={i} label={`${i} sales`} name={`kill_${i}`} value={m ? usd(m.kill_table_usd[i]) : ""} />
          ))}
        </div>
      </div>

      <div>
        <div className="lbl" style={{ marginBottom: 8 }}>Own line inputs · each ad is judged against its own line from its order value (File 3 §2)</div>
        <div className="fg fg-4">
          <Field label="Bottle cost" name="bottle_cost_tnd" value={val("bottle_cost_tnd", plain)} unit="TND, VAT incl." />
          <Field label="Delivery cost" name="delivery_cost_tnd" value={val("delivery_cost_tnd", (n) => n.toFixed(2))} unit="TND per delivered order" />
          <Field label="Fixed cost per order" name="fixed_per_order_tnd" value={val("fixed_per_order_tnd", (n) => n.toFixed(2))} unit="TND per delivered order" />
          <Field label="Delivered per Meta purchase" name="bridge_factor" value={val("bridge_factor", plain)} unit="0.6279 = 63 per 100" />
          <Field label="Door rate · 1 bottle" name="door_rate_1b" value={val("door_rate_1b", pct)} />
          <Field label="Door rate · 2 bottles" name="door_rate_2b" value={val("door_rate_2b", pct)} />
          <Field label="Door rate · 3+ bottles" name="door_rate_3b" value={val("door_rate_3b", pct)} />
          <Field label="Door rate · average" name="door_rate_avg" value={val("door_rate_avg", pct)} />
        </div>
      </div>

      <div className="fg fg-3">
        {([1, 2, 3] as const).map((b) => (
          <div className="f" key={b}>
            <span className="lbl">Own line · {b} bottle{b > 1 ? "s" : ""}</span>
            <span className="calc" aria-live="polite">{own(b)}</span>
            <span className="unit">
              {b === 1 ? m?.price_1b_tnd ?? 59 : b === 2 ? m?.price_2b_tnd ?? 90 : m?.price_3b_tnd ?? 129} TND orders · calculated
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <Msg state={state} />
        <button className="btn b-primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save money numbers"}</button>
      </div>
    </form>
  );
}

// ─────────────────────────────── People and pay ───────────────────────────────

const ROLE_LABEL: Record<Person["role"], string> = {
  founder_1: "founder 1",
  founder_2: "founder 2",
  copywriter: "copywriter",
  editor: "editor",
  agency: "no login",
  strategist: "no login",
};

function loginStatus(p: Person) {
  if (!p.active) return "switched off";
  if (p.role === "agency" || p.role === "strategist") return "—";
  return p.has_login ? `${ROLE_LABEL[p.role]} · active` : `${ROLE_LABEL[p.role]} · not logged in yet`;
}

function payUnitText(p: Person) {
  const unit = p.pay_unit ?? (p.role === "editor" ? "per_video" : "per_month");
  return unit === "per_video" ? "TND / video" : unit === "per_script" ? "TND / script" : "TND / month";
}

/** All people in one form with one "Save people" button (Settings artboard). Switch off acts right away. */
export function PeopleForm({ people, inactive }: { people: Person[]; inactive: Person[] }) {
  const [state, action, pending] = useActionState(savePeople, empty);
  return (
    <form onSubmit={keepValues(action)} style={{ display: "contents" }}>
      {people.map((p) => <PersonFields key={p.id} p={p} />)}
      {inactive.length > 0 && (
        <details>
          <summary className="unit" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>Switched off · {inactive.length}</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {inactive.map((p) => <PersonFields key={p.id} p={p} />)}
          </div>
        </details>
      )}
      <div className="unit">Adding someone here is what lets them log in. An editor ticked “full AI / 3D” gets a second box: the 3D generation rate (set at the first 3D launch).</div>
      <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <Msg state={state} />
        <button className="btn b-primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save people"}</button>
      </div>
    </form>
  );
}

function PersonFields({ p }: { p: Person }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<ActionState>(empty);
  const [ai, setAi] = useState(p.does_ai_3d);
  const founderRow = p.role.startsWith("founder");
  const loginRole = !["agency", "strategist"].includes(p.role);
  const f = (name: string) => `${name}__${p.id}`;
  const secondValue =
    p.role === "copywriter" ? (p.weekly_target === null ? "" : String(p.weekly_target)) : p.rate_3d_tnd === null ? "" : String(Number(p.rate_3d_tnd));

  return (
    <div className="prow">
      <span style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
        <input type="hidden" name="person_id" value={p.id} />
        <input className="fi" name={f("display_name")} defaultValue={p.display_name} aria-label={`Name of ${p.display_name}`} style={{ fontFamily: "var(--font)", fontWeight: 600 }} />
        {loginRole && (
          <input
            className={p.email ? "fi" : "fi fi-empty"}
            name={f("email")}
            type="email"
            defaultValue={p.email ?? ""}
            readOnly={p.has_login}
            aria-label={`${p.display_name} login email`}
            placeholder="login email"
            title={p.has_login ? "Already logged in: the email is fixed" : undefined}
            style={{ fontFamily: "var(--font)", fontWeight: 400, fontSize: 14 }}
          />
        )}
        <span className="unit">
          {ROLE_LABEL[p.role]}
          {p.role === "editor" && (
            <label style={{ marginLeft: 8, cursor: "pointer", display: "inline-flex", gap: 6, alignItems: "center", minHeight: 44 }}>
              <input type="checkbox" name={f("does_ai_3d")} checked={ai} onChange={(e) => setAi(e.target.checked)} /> full AI / 3D
            </label>
          )}
        </span>
      </span>
      {founderRow ? (
        <span className="unit">—</span>
      ) : (
        <span className="f">
          <input className={p.pay_amount_tnd === null ? "fi fi-empty" : "fi"} name={f("pay_amount_tnd")} defaultValue={p.pay_amount_tnd === null ? "" : Number(p.pay_amount_tnd).toLocaleString("en-US")} placeholder="to fill" aria-label={`${p.display_name} pay in TND`} inputMode="decimal" />
          <span className="unit">{payUnitText(p)}</span>
        </span>
      )}
      {p.role === "copywriter" || (p.role === "editor" && ai) ? (
        <span className="f">
          <input className={secondValue ? "fi" : "fi fi-empty"} name={f("second")} defaultValue={secondValue} placeholder="to fill" aria-label={p.role === "copywriter" ? "Weekly target" : "3D rate"} inputMode="decimal" />
          <span className="unit">{p.role === "copywriter" ? "scripts / week" : "TND / 3D generation"}</span>
        </span>
      ) : (
        <span className="unit">—</span>
      )}
      <span style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
        <span className="unit">{loginStatus(p)}</span>
        {!founderRow && (
          <button type="button" className="btn b-quiet" style={{ height: 44, paddingLeft: 0 }} disabled={busy}
            onClick={() => start(async () => setMsg(await setPersonActive(p.id, !p.active)))}>
            {p.active ? "Switch off" : "Switch on"}
          </button>
        )}
        <Msg state={msg} />
      </span>
    </div>
  );
}

export function AddPersonForm() {
  const [state, action, pending] = useActionState(addPerson, empty);
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState("copywriter");
  if (!open) {
    return (
      <button type="button" className="add" onClick={() => setOpen(true)}>+ Add person</button>
    );
  }
  const login = ["founder_1", "founder_2", "copywriter", "editor"].includes(role);
  return (
    <form action={action} className="prow" style={{ borderStyle: "dashed" }}>
      <input className="fi" name="display_name" placeholder="Name" aria-label="Name" required style={{ fontFamily: "var(--font)" }} />
      <select className="fi" name="role" value={role} onChange={(e) => setRole(e.target.value)} aria-label="Role">
        <option value="copywriter">Copywriter</option>
        <option value="editor">Editor</option>
        <option value="founder_2">Founder 2</option>
        <option value="agency">Agency (no login)</option>
        <option value="strategist">Strategist (no login)</option>
      </select>
      {login ? (
        <input className="fi" name="email" type="email" placeholder="login email" aria-label="Login email" required style={{ fontFamily: "var(--font)" }} />
      ) : (
        <span className="unit">no login</span>
      )}
      <input className="fi" name="pay_amount_tnd" placeholder={role === "editor" ? "TND / video" : "TND / month"} aria-label="Pay in TND" inputMode="decimal" />
      <span style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <button className="btn b-primary" type="submit" disabled={pending} style={{ height: 44 }}>{pending ? "Adding…" : "Add"}</button>
        <button className="btn b-quiet" type="button" onClick={() => setOpen(false)} style={{ height: 44 }}>Cancel</button>
        <Msg state={state} />
      </span>
    </form>
  );
}

// ─────────────────────────────── Alerts and late rules ───────────────────────────────

const GROUPS: { key: Rule["grp"]; label: string }[] = [
  { key: "copywriting", label: "Copywriting" },
  { key: "editing", label: "Editing and production" },
  { key: "live", label: "Live ads and stock" },
];

export function RulesForm({ rules, flags }: { rules: Rule[]; flags: Flag[] }) {
  const [state, action, pending] = useActionState(saveRules, empty);
  return (
    <form onSubmit={keepValues(action)} style={{ display: "contents" }}>
      <div className="fg rules-grid">
        {GROUPS.map((g) => (
          <div key={g.key} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div className="lbl" style={{ padding: "0 2px 8px" }}>{g.label}</div>
            {rules.filter((r) => r.grp === g.key).map((r) => (
              <div className="ar" key={r.key}>
                <label htmlFor={`rule_${r.key}`} style={{ fontSize: 14, lineHeight: 1.35 }}>{r.label}</label>
                <span style={{ display: "flex", alignItems: "center", gap: 8, flex: "none" }}>
                  <input
                    id={`rule_${r.key}`}
                    className={r.value === null ? "fi fi-empty" : "fi"}
                    style={{ width: 64, textAlign: "center" }}
                    name={`rule_${r.key}`}
                    defaultValue={r.value === null ? "" : String(Number(r.value))}
                    placeholder="—"
                    inputMode="numeric"
                  />
                  <span className="unit" style={{ width: 96 }}>{r.unit}</span>
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", alignItems: "center", fontSize: 14, paddingTop: 14, borderTop: "1px solid #ececE8" }}>
        {flags.map((f) => (
          <label className="tog-wrap" key={f.key}>
            <input type="checkbox" name={`flag_${f.key}`} defaultChecked={f.enabled} />
            <span className="tog" aria-hidden="true"><i /></span>
            {f.label}
          </label>
        ))}
        <span style={{ flex: 1 }} />
        <Msg state={state} />
        <button className="btn b-primary" type="submit" disabled={pending}>{pending ? "Saving…" : "Save alert rules"}</button>
      </div>
      <div className="hint">Emails start once the email sender is set up; until then alerts show in the app only.</div>
    </form>
  );
}

// ─────────────────────────────── Lists ───────────────────────────────

const LIST_META: Record<ListItem["list"], { title: string; note?: string; coded: boolean }> = {
  avatar: { title: "Avatars", note: "no BRD", coded: true },
  angle: { title: "Angles · approved", coded: true },
  hook_type: { title: "Hook types", coded: false },
  main_argument: { title: "Main arguments", note: "required in Script details", coded: false },
  format: { title: "Formats", coded: true },
};

function Chip({ item }: { item: ListItem }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<ActionState>(empty);
  return (
    <span className="li" title={item.code && item.code !== item.label ? `In ad names: ${item.code}` : undefined}>
      {item.label}
      {item.status === "reserved" && <span className="tag t-grey" style={{ padding: "4px 8px" }}>reserved</span>}
      <button
        type="button"
        aria-label={`Remove ${item.label}`}
        disabled={busy}
        onClick={() => start(async () => setMsg(await archiveListItem(item.id)))}
      >
        ×
      </button>
      {msg.error && <span className="formmsg err">{msg.error}</span>}
    </span>
  );
}

function RemovedChip({ item }: { item: ListItem }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<ActionState>(empty);
  return (
    <span className="li" style={{ color: "var(--ink-3)" }}>
      {item.label}
      <button type="button" aria-label={`Bring back ${item.label}`} title="Bring back" disabled={busy} style={{ width: "auto", borderRadius: 999, padding: "0 10px" }}
        onClick={() => start(async () => setMsg(await restoreListItem(item.id)))}>
        Bring back
      </button>
      {msg.error && <span className="formmsg err">{msg.error}</span>}
    </span>
  );
}

function AddItem({ list }: { list: ListItem["list"] }) {
  const [state, action, pending] = useActionState(addListItem, empty);
  const [open, setOpen] = useState(false);
  if (!open) return <button type="button" className="add" onClick={() => setOpen(true)}>+ Add</button>;
  const needsCode = list === "avatar" || list === "format";
  return (
    <form action={action} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <input type="hidden" name="list" value={list} />
      {needsCode && <input className="fi" name="code" placeholder="code, e.g. FSX" aria-label="Code used in ad names" style={{ width: 130 }} required />}
      <input className="fi" name="label" placeholder={list === "angle" ? "angle, e.g. Knee-Stairs" : "name"} aria-label="Name" style={{ width: 240, fontFamily: "var(--font)" }} required autoFocus />
      {list === "angle" && (
        <select className="fi" name="track" defaultValue="knee" aria-label="Track" style={{ width: 110 }}>
          <option value="knee">Knee</option>
          <option value="hips">Hips</option>
          <option value="both">Both</option>
        </select>
      )}
      <button className="btn b-primary" type="submit" disabled={pending} style={{ height: 44 }}>Add</button>
      <button className="btn b-quiet" type="button" onClick={() => setOpen(false)} style={{ height: 44 }}>Cancel</button>
      <Msg state={state} />
    </form>
  );
}

export function ListsBlock({ items }: { items: ListItem[] }) {
  const lists: ListItem["list"][] = ["avatar", "angle", "hook_type", "main_argument", "format"];
  return (
    <>
      {lists.map((l) => {
        const live = items.filter((i) => i.list === l && (i.status === "approved" || i.status === "reserved"));
        const onHold = items.filter((i) => i.list === l && i.status === "on_hold");
        const rejected = items.filter((i) => i.list === l && i.status === "rejected");
        const removed = items.filter((i) => i.list === l && i.status === "archived");
        const meta = LIST_META[l];
        return (
          <div key={l} style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="sh">
              <span className="lbl">{meta.title}{l === "avatar" ? ` · ${live.length}` : ""}</span>
              <span className="unit">
                {l === "angle"
                  ? `on hold: ${onHold.length ? onHold.map((i) => i.label).join(", ") : "none"} · rejected: ${rejected.length}`
                  : meta.note ?? ""}
              </span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
              {live.map((i) => <Chip key={i.id} item={i} />)}
              <AddItem list={l} />
            </div>
            {removed.length > 0 && (
              <details>
                <summary className="unit" style={{ cursor: "pointer", minHeight: 44, display: "flex", alignItems: "center" }}>Removed · {removed.length}</summary>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
                  {removed.map((i) => <RemovedChip key={i.id} item={i} />)}
                </div>
              </details>
            )}
          </div>
        );
      })}
      <div className="hint">Angles are written with dashes, never spaces, because ad names are split on “_”. Reserved angles exist in File 6 but have no live ads yet.</div>
    </>
  );
}

// ─────────────────────────────── Campaigns in scope ───────────────────────────────

export function CampaignRows({ campaigns }: { campaigns: Campaign[] }) {
  return (
    <>
      {campaigns.map((c) => <CampaignRow key={c.campaign_id} c={c} />)}
      <AddCampaign />
    </>
  );
}

function CampaignRow({ c }: { c: Campaign }) {
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<ActionState>(empty);
  return (
    <div className="drow">
      <span><b style={{ fontWeight: 600 }}>{c.name}</b> <span className="unit mono">{c.campaign_id}</span></span>
      <span><span className="src">{c.kind} · {c.track.toUpperCase()}</span></span>
      <span className="unit">{c.active ? "will be read by the daily Meta pull (not connected yet)" : "out of scope"} {msg.error && <span className="formmsg err">{msg.error}</span>}</span>
      <span>
        <button type="button" className="btn b-quiet" style={{ height: 44 }} disabled={busy}
          onClick={() => start(async () => setMsg(await setCampaignActive(c.campaign_id, !c.active)))}>
          {c.active ? "Take out of scope" : "Put back in scope"}
        </button>
      </span>
    </div>
  );
}

function AddCampaign() {
  const [state, action, pending] = useActionState(addCampaign, empty);
  const [open, setOpen] = useState(false);
  if (!open) return <div><button type="button" className="add" onClick={() => setOpen(true)}>+ Add campaign</button></div>;
  return (
    <form action={action} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
      <input className="fi" name="campaign_id" placeholder="Campaign ID" aria-label="Campaign ID" inputMode="numeric" style={{ width: 210 }} required />
      <input className="fi" name="name" placeholder="Name in Ads Manager" aria-label="Campaign name" style={{ width: 240, fontFamily: "var(--font)" }} required />
      <select className="fi" name="track" aria-label="Track" style={{ width: 110 }} defaultValue="knee"><option value="knee">Knee</option><option value="hips">Hips</option></select>
      <select className="fi" name="kind" aria-label="ABO or CBO" style={{ width: 100 }} defaultValue="ABO"><option>ABO</option><option>CBO</option></select>
      <button className="btn b-primary" type="submit" disabled={pending} style={{ height: 44 }}>Add</button>
      <button className="btn b-quiet" type="button" onClick={() => setOpen(false)} style={{ height: 44 }}>Cancel</button>
      <Msg state={state} />
    </form>
  );
}

// ─────────────────────────────── Copywriter levels ───────────────────────────────

export function LevelsForm({ levels }: { levels: Level[] }) {
  const [state, action, pending] = useActionState(saveLevels, empty);
  const [count, setCount] = useState(Math.max(3, levels.length));
  return (
    <form onSubmit={keepValues(action)} style={{ display: "contents" }}>
      <div className="fg fg-3">
        {Array.from({ length: count }, (_, i) => {
          const l = levels[i];
          return (
            <div className="f" key={i}>
              <label className="lbl" htmlFor={`level_${i}`}>Level {i + 1} · name and rule</label>
              <input id={`level_${i}`} className={l ? "fi" : "fi fi-empty"} name="level" defaultValue={l?.name_and_rule ?? ""} placeholder="to fill" style={{ fontFamily: "var(--font)" }} />
              <input className={l?.bonus_tnd !== null && l?.bonus_tnd !== undefined ? "fi" : "fi fi-empty"} name="bonus" defaultValue={l?.bonus_tnd ?? ""} placeholder="bonus, TND / month" aria-label={`Level ${i + 1} bonus in TND`} inputMode="decimal" />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button type="button" className="add" onClick={() => setCount((c) => c + 1)}>+ Add level</button>
        <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Msg state={state} />
          <button className="btn b-ghost" type="submit" disabled={pending}>{pending ? "Saving…" : "Save draft"}</button>
        </span>
      </div>
    </form>
  );
}

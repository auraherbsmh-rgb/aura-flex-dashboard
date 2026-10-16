import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/viewer";
import { ageLabel, shortAwareness, type Proposal } from "@/lib/proposals-shared";
import { fmtDay, prodStage, type LaunchNames, type ProdCard, type Production, type TaskRow } from "@/lib/tasks-shared";

/**
 * Needs me (handoff §6): one list, most urgent first, grouped Late / over 48h · Today · This week · New
 * (Today = arrived today in Tunisia and over 12h old, New = under 12h).
 * Items are computed from the records they are about, never stored, so they disappear the moment the work is done.
 * Built so far: DECIDE and REVIEW (script), FOOTAGE and ASSIGN (production), and COVERING for each.
 * The other types arrive with their screens.
 */
export type NeedItem = {
  key: string;
  type: "DECIDE" | "REVIEW" | "FOOTAGE" | "ASSIGN" | "LAUNCH" | "COVERING";
  tagTone: "violet" | "blue" | "orange" | "green";
  title: string;
  sub: string;
  age: string;
  ageTone: "red" | "amber" | "grey";
  hours: number;
  /** DECIDE items open the Decide pop-up; REVIEW items open the task view. */
  proposal?: Proposal;
  href?: string;
  /** FOOTAGE and ASSIGN items open their pop-up right on Home. */
  prod?: { kind: "footage" | "assign" | "launch"; card: ProdCard; current?: Production; names?: LaunchNames; approvedAt?: string | null };
};

export type ProdNeeds = {
  cards: Map<string, ProdCard>;
  productions: Map<string, Production>;
  footageLateDays: number;
  assignLateDays: number;
  coverHours?: number;
  /** Edit versions by task: a version waiting for review is a REVIEW item for Founder 2. */
  editRounds?: Map<string, { round: number; submittedAt: string; decision: string | null; decidedAt?: string | null }[]>;
  /** LAUNCH: approved edits not launched yet (late after the launch rule, in days). */
  launchLateDays?: number;
  launchNames?: Map<string, LaunchNames>;
};
export type NeedGroup = { name: string; tone: "red" | "amber" | "grey"; items: NeedItem[] };

export async function getRule(key: string, fallback: number): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("alert_rules").select("value").eq("key", key).maybeSingle();
  return data?.value === null || data?.value === undefined ? fallback : Number(data.value);
}

export function buildNeeds(
  viewer: Viewer,
  proposals: Proposal[],
  unansweredHours: number,
  now = Date.now(),
  tasks: TaskRow[] = [],
  reviewHours = 48,
  prod?: ProdNeeds,
): NeedGroup[] {
  const items: NeedItem[] = [];
  // REVIEW (edit): a version waiting for Founder 2; Founder 1 covers after 48h.
  if (prod?.editRounds) {
    for (const [taskId, list] of prod.editRounds) {
      const last = list[list.length - 1];
      const card = prod.cards.get(taskId);
      if (!last || last.decision || !card) continue;
      const cover = prod.coverHours ?? 48;
      const age = ageLabel(last.submittedAt, now, cover);
      const late = age.hours >= cover;
      const editor = prod.productions.get(taskId)?.editorName ?? "editor";
      const title = `Review edit: ${card.face} v${last.round}`;
      const sub = `${card.cell} · ${card.format} · ${editor}`;
      const href = `/editing?task=${taskId}#edit-view`;
      if (viewer.role === "founder_2") {
        items.push({ key: `e-${taskId}`, type: "REVIEW", tagTone: "blue", title, sub, age: age.text, ageTone: late ? "red" : "amber", hours: age.hours, href });
      } else if (viewer.role === "founder_1" && late) {
        items.push({ key: `e-${taskId}`, type: "COVERING", tagTone: "orange", title, sub: `Founder 2's review, waiting over ${cover}h · ${sub}`, age: age.text, ageTone: "red", hours: age.hours, href });
      }
    }
  }
  // LAUNCH: edit approved, not launched yet. Founder 2's; Founder 1 covers after 48h.
  if (prod?.editRounds) {
    for (const [taskId, list] of prod.editRounds) {
      const ok = list.find((r) => r.decision === "approved");
      const card = prod.cards.get(taskId);
      const p = prod.productions.get(taskId);
      if (!ok || !card || p?.launchedAt) continue;
      const since = ok.decidedAt ?? ok.submittedAt;
      const lateH = (prod.launchLateDays ?? 2) * 24;
      const cover = prod.coverHours ?? 48;
      const age = ageLabel(since, now, Math.min(lateH, cover));
      const late = age.hours >= lateH;
      const n = prod.launchNames?.get(taskId)?.ads.length ?? 0;
      const title = `${card.cell} · ${card.format} ${card.face} approved`;
      const sub = `1 concept to launch · ${n} hook${n === 1 ? "" : "s"}${n ? ` (V1–V${n})` : ""} · names ready to copy`;
      const extra = { card, current: p, names: prod.launchNames?.get(taskId), approvedAt: ok.decidedAt ?? null };
      if (viewer.role === "founder_2") {
        items.push({ key: `l-${taskId}`, type: "LAUNCH", tagTone: "green", title, sub, age: age.text, ageTone: late ? "red" : "amber", hours: age.hours, prod: { kind: "launch", ...extra } });
      } else if (viewer.role === "founder_1" && age.hours >= cover) {
        items.push({ key: `l-${taskId}`, type: "COVERING", tagTone: "orange", title, sub: `Founder 2's launch, waiting over ${cover}h · ${sub}`, age: age.text, ageTone: late ? "red" : "amber", hours: age.hours, prod: { kind: "launch", ...extra } });
      }
    }
  }
  // FOOTAGE (from the shoot day) and ASSIGN (footage in, or AI / 3D confirmed): Founder 2's; Founder 1 covers when late.
  if (prod) {
    const today = new Date(now + 36e5).toISOString().slice(0, 10);
    for (const card of prod.cards.values()) {
      const p = prod.productions.get(card.taskId);
      const stage = prodStage(card.generate, p);
      let kind: "footage" | "assign";
      let since: string;
      let lateH: number;
      if (stage === "shoot") {
        if (!card.shootOn || card.shootOn > today) continue;
        kind = "footage";
        since = `${card.shootOn}T00:00:00+01:00`;
        lateH = prod.footageLateDays * 24;
      } else if (stage === "assign") {
        kind = "assign";
        since = p?.footageAt ?? card.confirmedAt ?? new Date(now).toISOString();
        lateH = prod.assignLateDays * 24;
      } else continue;
      const age = ageLabel(since, now, lateH);
      const late = age.hours >= lateH;
      // Covering follows the 48h rule (handoff §6), not the alert rules, so Settings changes don't move it.
      const covering = age.hours >= (prod.coverHours ?? 48);
      const title = `${card.cell} · ${card.format} · ${card.face}`;
      const sub = kind === "footage"
        ? `Shoot ${fmtDay(card.shootOn ?? today)} · paste the raw Drive link`
        : card.generate ? "AI / 3D · no editor yet" : "Footage in, no editor yet";
      const type = kind === "footage" ? "FOOTAGE" : "ASSIGN";
      if (viewer.role === "founder_2") {
        items.push({ key: `${kind}-${card.taskId}`, type, tagTone: kind === "footage" ? "blue" : "violet", title, sub, age: age.text, ageTone: late ? "red" : "amber", hours: age.hours, prod: { kind, card, current: p } });
      } else if (viewer.role === "founder_1" && covering) {
        items.push({ key: `${kind}-${card.taskId}`, type: "COVERING", tagTone: "orange", title, sub: `Founder 2's ${type.toLowerCase()}, waiting over ${prod.coverHours ?? 48}h · ${sub}`, age: age.text, ageTone: late ? "red" : "amber", hours: age.hours, prod: { kind, card, current: p } });
      }
    }
  }
  // REVIEW: a script waiting on Founder 1 (Founder 2 covers after the review rule).
  for (const t of tasks.filter((x) => x.status === "review")) {
    const last = t.rounds[t.rounds.length - 1];
    if (!last || last.decision) continue;
    const age = ageLabel(last.submittedAt, now, reviewHours);
    const late = age.hours >= reviewHours;
    const cell = `${t.avatarCode} × ${shortAwareness(t.awareness)}`;
    const href = `/copywriting?task=${t.id}#task-view`;
    const title = `Review script: ${t.angle}`;
    if (viewer.role === "founder_1") {
      items.push({ key: `r-${t.id}`, type: "REVIEW", tagTone: "blue", title, sub: `${cell} · ${t.copywriter} · round ${last.round}`, age: age.text, ageTone: late ? "red" : "amber", hours: age.hours, href });
    } else if (viewer.role === "founder_2" && late) {
      items.push({ key: `r-${t.id}`, type: "COVERING", tagTone: "orange", title, sub: `Founder 1's review, waiting over ${reviewHours}h · ${cell} · ${t.copywriter}`, age: age.text, ageTone: "red", hours: age.hours, href });
    }
  }
  for (const p of proposals.filter((x) => x.status === "waiting")) {
    const age = ageLabel(p.createdAt, now, unansweredHours);
    const late = age.hours >= unansweredHours;
    const cell = `${p.avatarCode} × ${shortAwareness(p.awareness)}`;
    const title = p.isNewAngle ? `New angle: ${p.angle}` : `Test: ${p.angle}`;
    if (viewer.role === "founder_1") {
      items.push({ key: p.id, type: "DECIDE", tagTone: "violet", title, sub: `${cell} · proposed by ${p.proposedBy}`, age: age.text, ageTone: late ? "red" : "amber", hours: age.hours, proposal: p });
    } else if (viewer.role === "founder_2" && late) {
      // Covering: anything waiting 48h on Founder 1 appears on Founder 2's list.
      items.push({ key: p.id, type: "COVERING", tagTone: "orange", title, sub: `Founder 1's decision, waiting over ${unansweredHours}h · ${cell}`, age: age.text, ageTone: "red", hours: age.hours, proposal: p });
    }
  }
  items.sort((a, b) => b.hours - a.hours);
  // Both rules are 48h today; the late group uses the smaller one so nothing late hides in "This week".
  const lateFrom = Math.min(unansweredHours, reviewHours);
  const late = items.filter((i) => i.ageTone === "red" || i.hours >= lateFrom);
  const rest = items.filter((i) => !late.includes(i));
  const week = rest.filter((i) => i.hours >= 24);
  const today = rest.filter((i) => i.hours >= 12 && i.hours < 24);
  const fresh = rest.filter((i) => i.hours < 12);
  return [
    { name: `LATE / OVER ${lateFrom}H`, tone: "red" as const, items: late },
    { name: "TODAY", tone: "amber" as const, items: today },
    { name: "THIS WEEK", tone: "amber" as const, items: week },
    { name: "NEW", tone: "grey" as const, items: fresh },
  ].filter((g) => g.items.length > 0);
}

/**
 * "All" on Home (Founder Home artboard: Mine | All): both founders' items in one list, each marked with whose it is.
 * The same item seen as COVERING on one side and as its own type on the other is shown once, as its own type.
 */
export function mergeNeeds(f1: NeedGroup[], f2: NeedGroup[]): NeedGroup[] {
  const order: string[] = [];
  const byKey = new Map<string, { group: NeedGroup; item: NeedItem }>();
  const add = (groups: NeedGroup[], owner: string) => {
    for (const g of groups) {
      if (!order.includes(g.name)) order.push(g.name);
      for (const it of g.items) {
        const prev = byKey.get(it.key);
        const own = it.type !== "COVERING";
        if (prev && (prev.item.type !== "COVERING" || !own)) continue;
        byKey.set(it.key, { group: g, item: own ? { ...it, sub: `${owner} · ${it.sub}` } : it });
      }
    }
  };
  add(f1, "Founder 1");
  add(f2, "Founder 2");
  const rank = (name: string) => (name.startsWith("LATE") ? 0 : name === "TODAY" ? 1 : name === "THIS WEEK" ? 2 : 3);
  return [...new Set(order)]
    .sort((a, b) => rank(a) - rank(b))
    .map((name) => {
      const items = [...byKey.values()].filter((x) => x.group.name === name).map((x) => x.item).sort((a, b) => b.hours - a.hours);
      return { name, tone: (byKey.size && [...byKey.values()].find((x) => x.group.name === name)?.group.tone) || "grey", items } as NeedGroup;
    })
    .filter((g) => g.items.length > 0);
}

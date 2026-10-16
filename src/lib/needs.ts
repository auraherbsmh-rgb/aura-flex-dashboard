import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/viewer";
import { ageLabel, shortAwareness, type Proposal } from "@/lib/proposals-shared";
import type { KillNeed, Unmapped, UnmappedNeed } from "@/lib/live-shared";
import { fmtDay, isHeld, prodStage, type LaunchNames, type ProdCard, type Production, type TaskRow, type TestimonialLite } from "@/lib/tasks-shared";

/**
 * Needs me (handoff §6): one list, most urgent first, grouped Late / over 48h · Today · This week · New
 * (Today = arrived today in Tunisia and over 12h old, New = under 12h).
 * Items are computed from the records they are about, never stored, so they disappear the moment the work is done.
 * Built: DECIDE, REVIEW, OVERDUE, FOOTAGE, VO, ASSIGN, LAUNCH, TESTIMONIAL, KILL, UNMAPPED, and COVERING for each.
 * The other types arrive with their screens.
 */
export type NeedItem = {
  key: string;
  type: "DECIDE" | "REVIEW" | "OVERDUE" | "FOOTAGE" | "VO" | "ASSIGN" | "LAUNCH" | "TESTIMONIAL" | "KILL" | "UNMAPPED" | "COVERING";
  tagTone: "violet" | "blue" | "orange" | "green" | "grey" | "red" | "amber";
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
  /** TESTIMONIAL items open the Testimonial tag pop-up. */
  testimonial?: TestimonialLite;
  /** KILL items open the Pause in Meta pop-up; UNMAPPED items open Tag an old ad. */
  kill?: KillNeed;
  unmapped?: Unmapped;
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
  /** Support-call recordings waiting to be tagged: TESTIMONIAL items (Founder 2; Founder 1 covers after 48h). */
  testimonials?: TestimonialLite[];
  /** From the daily Meta pull (Live ads): KILL (Founder 2, Founder 1 covers after 48h) and UNMAPPED (both founders). */
  kills?: KillNeed[];
  unmapped?: UnmappedNeed[];
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
      if (!last || last.decision || !card || isHeld(prod.productions.get(taskId))) continue;
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
      if (!ok || !card || p?.launchedAt || isHeld(p)) continue;
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
  // TESTIMONIAL: a support-call recording waiting to be tagged (Founder 2; Founder 1 covers after 48h).
  for (const tm of prod?.testimonials ?? []) {
    const cover = prod?.coverHours ?? 48;
    const age = ageLabel(tm.addedAt, now, cover);
    const title = "New testimonial · tag it or mark not usable";
    const sub = `Support call${tm.note ? ` · ${tm.note}` : ""}`;
    if (viewer.role === "founder_2") {
      items.push({ key: `t-${tm.id}`, type: "TESTIMONIAL", tagTone: "amber", title, sub, age: age.text, ageTone: "amber", hours: age.hours, testimonial: tm });
    } else if (viewer.role === "founder_1" && age.hours >= cover) {
      items.push({ key: `t-${tm.id}`, type: "COVERING", tagTone: "orange", title, sub: `Founder 2's testimonial, waiting over ${cover}h · ${sub}`, age: age.text, ageTone: "red", hours: age.hours, testimonial: tm });
    }
  }
  if (prod) {
    const today = new Date(now + 36e5).toISOString().slice(0, 10);
    for (const card of prod.cards.values()) {
      const p = prod.productions.get(card.taskId);
      if (isHeld(p)) continue; // on hold: no Home item until resumed
      const stage = prodStage(card.generate, p);
      let kind: "footage" | "assign";
      let since: string;
      let lateH: number;
      if (stage === "shoot" && card.vo) {
        // VO, no shoot: due from the details confirmation.
        kind = "footage";
        since = card.confirmedAt ?? new Date(now).toISOString();
        lateH = prod.footageLateDays * 24;
      } else if (stage === "shoot") {
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
        ? card.vo ? "VO, no shoot · paste the recording link" : `Shoot ${fmtDay(card.shootOn ?? today)} · paste the raw Drive link`
        : card.generate ? "AI / 3D · no editor yet" : card.vo ? "VO in, no editor yet" : card.testimonial ? "Testimonial · recording in, no editor yet" : "Footage in, no editor yet";
      const type = kind === "footage" ? (card.vo ? "VO" : "FOOTAGE") : "ASSIGN";
      if (viewer.role === "founder_2") {
        items.push({ key: `${kind}-${card.taskId}`, type, tagTone: kind === "footage" ? "blue" : "violet", title, sub, age: age.text, ageTone: late ? "red" : "amber", hours: age.hours, prod: { kind, card, current: p } });
      } else if (viewer.role === "founder_1" && covering) {
        items.push({ key: `${kind}-${card.taskId}`, type: "COVERING", tagTone: "orange", title, sub: `Founder 2's ${type === "VO" ? "VO" : type.toLowerCase()}, waiting over ${prod.coverHours ?? 48}h · ${sub}`, age: age.text, ageTone: late ? "red" : "amber", hours: age.hours, prod: { kind, card, current: p } });
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
  // OVERDUE (Founder 1): a script being written or revised past its due date.
  if (viewer.role === "founder_1") {
    const today = new Date(now + 36e5).toISOString().slice(0, 10);
    for (const t of tasks.filter((x) => (x.status === "writing" || x.status === "changes") && x.dueOn < today)) {
      const late = Math.round((Date.parse(today) - Date.parse(t.dueOn)) / 864e5);
      const day = new Date(`${t.dueOn}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
      items.push({
        key: `o-${t.id}`, type: "OVERDUE", tagTone: "red", title: `${t.avatarCode} × ${shortAwareness(t.awareness)} script · ${t.copywriter}`,
        sub: `${t.angle} · ${t.status === "changes" ? "revision " : ""}was due ${day}`, age: `+${late} DAY${late === 1 ? "" : "S"}`, ageTone: "red",
        hours: late * 24, href: `/copywriting?task=${t.id}#task-view`,
      });
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
  // KILL (Live ads flag: kill line / fading / deteriorating / twin split): Founder 2 pauses in Meta; Founder 1 covers after 48h.
  const FLAG_WORD = { kill: "Kill line", fading: "Fading", deteriorating: "Deteriorating", twin: "Twin split" } as const;
  for (const k of prod?.kills ?? []) {
    const cover = prod?.coverHours ?? 48;
    const age = ageLabel(new Date(k.sinceMs).toISOString(), now, cover);
    const title = `${FLAG_WORD[k.flag]} · pause ${k.concept}`;
    const sub = k.recheck ? `${k.recheck} · ${k.reason}` : k.reason;
    if (viewer.role === "founder_2") {
      items.push({ key: k.key, type: "KILL", tagTone: "red", title, sub, age: age.text, ageTone: "red", hours: age.hours, kill: k });
    } else if (viewer.role === "founder_1" && age.hours >= cover) {
      items.push({ key: k.key, type: "COVERING", tagTone: "orange", title, sub: `Founder 2's kill, waiting over ${cover}h · ${sub}`, age: age.text, ageTone: "red", hours: age.hours, kill: k });
    }
  }
  // UNMAPPED: a live ad in scope with an old or unknown name: either founder tags it.
  for (const u of prod?.unmapped ?? []) {
    const age = ageLabel(new Date(u.sinceMs).toISOString(), now);
    items.push({
      key: u.key, type: "UNMAPPED", tagTone: "grey", title: `Tag an old ad · ${u.u.example}`,
      sub: `${u.u.adIds.length} ad${u.u.adIds.length === 1 ? "" : "s"} · $${Math.round(u.u.spend7)} · ${u.u.sales7} sales in 7d`, age: age.text, ageTone: "grey", hours: age.hours, unmapped: u.u,
    });
  }
  items.sort((a, b) => b.hours - a.hours);
  // Both rules are 48h today; the late group uses the smaller one so nothing late hides in "This week".
  const lateFrom = Math.min(unansweredHours, reviewHours);
  // Founder 2's list puts KILL first (handoff §6): its own group on top.
  const kill = items.filter((i) => i.type === "KILL");
  // UNMAPPED: old ads to tag, never "late" (all old ads share the first-pull day): their own group at the bottom.
  const toTag = items.filter((i) => i.type === "UNMAPPED");
  const late = items.filter((i) => i.type !== "KILL" && i.type !== "UNMAPPED" && (i.ageTone === "red" || i.hours >= lateFrom));
  const rest = items.filter((i) => !late.includes(i) && !kill.includes(i) && !toTag.includes(i));
  const week = rest.filter((i) => i.hours >= 24);
  const today = rest.filter((i) => i.hours >= 12 && i.hours < 24);
  const fresh = rest.filter((i) => i.hours < 12);
  return [
    { name: "KILL · ACT IN META FIRST", tone: "red" as const, items: kill },
    { name: `LATE / OVER ${lateFrom}H`, tone: "red" as const, items: late },
    { name: "TODAY", tone: "amber" as const, items: today },
    { name: "THIS WEEK", tone: "amber" as const, items: week },
    { name: "NEW", tone: "grey" as const, items: fresh },
    { name: "OLD ADS TO TAG", tone: "grey" as const, items: toTag },
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
        byKey.set(it.key, { group: g, item: own && it.type !== "UNMAPPED" ? { ...it, sub: `${owner} · ${it.sub}` } : it });
      }
    }
  };
  add(f1, "Founder 1");
  add(f2, "Founder 2");
  const rank = (name: string) => (name.startsWith("KILL") ? -1 : name.startsWith("LATE") ? 0 : name === "TODAY" ? 1 : name === "THIS WEEK" ? 2 : name.startsWith("OLD ADS") ? 4 : 3);
  return [...new Set(order)]
    .sort((a, b) => rank(a) - rank(b))
    .map((name) => {
      const items = [...byKey.values()].filter((x) => x.group.name === name).map((x) => x.item).sort((a, b) => b.hours - a.hours);
      return { name, tone: (byKey.size && [...byKey.values()].find((x) => x.group.name === name)?.group.tone) || "grey", items } as NeedGroup;
    })
    .filter((g) => g.items.length > 0);
}

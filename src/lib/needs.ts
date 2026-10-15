import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/viewer";
import { ageLabel, shortAwareness, type Proposal } from "@/lib/proposals-shared";
import type { TaskRow } from "@/lib/tasks-shared";

/**
 * Needs me (handoff §6): one list, most urgent first, grouped Late / over 48h · Today · This week · New.
 * Items are computed from the records they are about, never stored, so they disappear the moment the work is done.
 * Built so far: DECIDE and REVIEW (script), and COVERING for both. The other types arrive with their screens.
 */
export type NeedItem = {
  key: string;
  type: "DECIDE" | "REVIEW" | "COVERING";
  tagTone: "violet" | "blue" | "orange";
  title: string;
  sub: string;
  age: string;
  ageTone: "red" | "amber" | "grey";
  hours: number;
  /** DECIDE items open the Decide pop-up; REVIEW items open the task view. */
  proposal?: Proposal;
  href?: string;
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
): NeedGroup[] {
  const items: NeedItem[] = [];
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
  const week = items.filter((i) => !late.includes(i) && i.hours >= 24);
  const fresh = items.filter((i) => !late.includes(i) && i.hours < 24);
  return [
    { name: `LATE / OVER ${lateFrom}H`, tone: "red" as const, items: late },
    { name: "THIS WEEK", tone: "amber" as const, items: week },
    { name: "NEW", tone: "grey" as const, items: fresh },
  ].filter((g) => g.items.length > 0);
}

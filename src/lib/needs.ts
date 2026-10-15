import { createClient } from "@/lib/supabase/server";
import type { Viewer } from "@/lib/viewer";
import { ageLabel, shortAwareness, type Proposal } from "@/lib/proposals-shared";

/**
 * Needs me (handoff §6): one list, most urgent first, grouped Late / over 48h · Today · This week · New.
 * Items are computed from the records they are about, never stored, so they disappear the moment the work is done.
 * Built so far: DECIDE (and COVERING for it). The other types arrive with their screens.
 */
export type NeedItem = {
  key: string;
  type: "DECIDE" | "COVERING";
  tagTone: "violet" | "orange";
  title: string;
  sub: string;
  age: string;
  ageTone: "red" | "amber" | "grey";
  hours: number;
  proposal: Proposal;
};
export type NeedGroup = { name: string; tone: "red" | "amber" | "grey"; items: NeedItem[] };

export async function getRule(key: string, fallback: number): Promise<number> {
  const supabase = await createClient();
  const { data } = await supabase.from("alert_rules").select("value").eq("key", key).maybeSingle();
  return data?.value === null || data?.value === undefined ? fallback : Number(data.value);
}

export function buildNeeds(viewer: Viewer, proposals: Proposal[], unansweredHours: number, now = Date.now()): NeedGroup[] {
  const items: NeedItem[] = [];
  for (const p of proposals.filter((x) => x.status === "waiting")) {
    const age = ageLabel(p.createdAt, now);
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
  const late = items.filter((i) => i.hours >= unansweredHours);
  const week = items.filter((i) => i.hours < unansweredHours && i.hours >= 24);
  const fresh = items.filter((i) => i.hours < 24);
  return [
    { name: `LATE / OVER ${unansweredHours}H`, tone: "red" as const, items: late },
    { name: "THIS WEEK", tone: "amber" as const, items: week },
    { name: "NEW", tone: "grey" as const, items: fresh },
  ].filter((g) => g.items.length > 0);
}

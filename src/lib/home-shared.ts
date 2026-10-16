/**
 * Founder Homes (handoff §6, artboards "Founder 1 Home" and "Founder 2 Home"): the three numbers and Blocked.
 * Pure functions, safe for server and browser.
 *  F1: scripts approved this week (target = sum of copywriters' weekly targets) · won / settled 3 months (Meta) ·
 *      cells needing a successor (Meta).
 *  F2: videos delivered this week (edits approved; same weekly target) · approved script → live ad (days, split into
 *      editing / revisions / waiting, videos launched in the last 30 days) · concepts waiting to launch.
 *  Blocked: read-only, what is stuck on someone else (copywriter, agency, editor) and for how long.
 */
import type { EditRound, VideoRow } from "./editing-shared";
import { isHeld, weekStartIso, type Production, type TaskRow } from "./tasks-shared";

export type Pace = { done: number; target: number | null; pct: number | null; tone: "green" | "amber" | "grey"; word: string };
export type SpeedSplit = { total: number; editing: number; revisions: number; waiting: number; count: number } | null;
export type WaitingLaunch = { taskId: string; title: string; sub: string; days: number };
export type BlockedItem = { key: string; what: string; who: string; since: number; text: string; late: boolean };

/** This week's pace against a weekly target (Monday → Sunday, Tunisia time). */
export function pace(done: number, target: number | null, now: number): Pace {
  if (!target) return { done, target: null, pct: null, tone: "grey", word: "NO TARGET IN SETTINGS" };
  const pct = Math.round((done / target) * 100);
  if (done >= target) return { done, target, pct, tone: "green", word: "TARGET MET" };
  const elapsed = Math.min(7, Math.max(0, (now - Date.parse(weekStartIso(new Date(now)))) / 864e5));
  const expected = Math.floor((target * elapsed) / 7);
  const left = target - done;
  return done >= expected
    ? { done, target, pct, tone: "green", word: `ON PACE · ${left} TO GO` }
    : { done, target, pct, tone: "amber", word: `BEHIND · ${left} TO GO` };
}

/** Scripts approved this week (each task counted once, at its approval). */
export function scriptsApprovedThisWeek(tasks: TaskRow[], now: number): number {
  const from = Date.parse(weekStartIso(new Date(now)));
  return tasks.filter((t) => t.rounds.some((r) => r.decision === "approved" && r.decidedAt && Date.parse(r.decidedAt) >= from)).length;
}

/** Videos delivered this week = edits approved this week. */
export function videosApprovedThisWeek(rounds: Map<string, EditRound[]>, now: number): number {
  const from = Date.parse(weekStartIso(new Date(now)));
  let n = 0;
  for (const list of rounds.values()) if (list.some((r) => r.decision === "approved" && r.decidedAt && Date.parse(r.decidedAt) >= from)) n++;
  return n;
}

const days = (ms: number) => Math.max(0, ms) / 864e5;
const round1 = (x: number) => Math.round(x * 10) / 10;

/**
 * Approved script → live ad, averaged over videos launched in the last 30 days.
 * Editing = editor start → first version · Revisions = first version → edit approved · Waiting = the rest
 * (shoot, footage, assignment, start, launch). Testimonials (no script) start when the task was created.
 */
export function speedSplit(tasks: TaskRow[], productions: Map<string, Production>, rounds: Map<string, EditRound[]>, now: number): SpeedSplit {
  const rows: { total: number; editing: number; revisions: number }[] = [];
  for (const t of tasks) {
    const p = productions.get(t.id);
    const end = p?.liveAt ?? p?.launchedAt;
    if (!p || !end || now - Date.parse(end) > 30 * 864e5) continue;
    const scriptOk = [...t.rounds].reverse().find((r) => r.decision === "approved")?.decidedAt ?? t.createdAt;
    const r = rounds.get(t.id) ?? [];
    const first = r[0];
    const ok = r.find((x) => x.decision === "approved");
    const start = p.editStartedAt ?? p.assignedAt;
    const total = days(Date.parse(end) - Date.parse(scriptOk));
    const editing = first && start ? days(Date.parse(first.submittedAt) - Date.parse(start)) : 0;
    const revisions = first && ok?.decidedAt ? days(Date.parse(ok.decidedAt) - Date.parse(first.submittedAt)) : 0;
    rows.push({ total, editing: Math.min(editing, total), revisions: Math.min(revisions, Math.max(0, total - editing)) });
  }
  if (!rows.length) return null;
  const avg = (k: "total" | "editing" | "revisions") => rows.reduce((s, x) => s + x[k], 0) / rows.length;
  const total = avg("total");
  const editing = avg("editing");
  const revisions = avg("revisions");
  return { total: round1(total), editing: round1(editing), revisions: round1(revisions), waiting: round1(Math.max(0, total - editing - revisions)), count: rows.length };
}

/** Edits approved and not launched yet (on hold left out), oldest first. */
export function waitingToLaunch(
  tasks: TaskRow[],
  productions: Map<string, Production>,
  rounds: Map<string, EditRound[]>,
  faces: Map<string, string>,
  hooks: Map<string, number>,
  now: number,
): WaitingLaunch[] {
  const out: WaitingLaunch[] = [];
  for (const t of tasks) {
    const p = productions.get(t.id);
    const ok = (rounds.get(t.id) ?? []).find((r) => r.decision === "approved");
    if (!ok || p?.launchedAt || isHeld(p)) continue;
    const since = Date.parse(ok.decidedAt ?? ok.submittedAt);
    const day = new Date(since + 36e5).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
    const n = hooks.get(t.id) ?? 0;
    out.push({
      taskId: t.id,
      title: `${t.avatarCode} × ${t.awareness.replace("-Aware", "")} · ${t.formatCode === "AI" ? "AI / 3D" : t.formatCode} ${faces.get(t.id) ?? t.angle}`,
      sub: `Approved ${day} · ${n} hook${n === 1 ? "" : "s"}`,
      days: Math.floor(days(now - since)),
    });
  }
  return out.sort((a, b) => b.days - a.days);
}

const ago = (fromMs: number, now: number) => {
  const h = Math.max(0, (now - fromMs) / 36e5);
  if (h < 24) return `${Math.floor(h)}h`;
  const d = Math.floor(h / 24);
  return `${d} day${d === 1 ? "" : "s"}`;
};

/**
 * Blocked (read-only): what waits on someone else.
 *  Scripts (Founder 1's side): changes asked and not sent back yet · approved, details not confirmed.
 *  Videos (both): waiting on the agency for a shoot, or an editor (not started, editing, changes), and on hold.
 *  Footage after the shoot day is a FOOTAGE item in Needs me (Founder 1 sees it as COVERING after 48h), so it is not here.
 */
export function buildBlocked(tasks: TaskRow[], videoRows: VideoRow[], now: number, withScripts: boolean): BlockedItem[] {
  const out: BlockedItem[] = [];
  const today = new Date(now + 36e5).toISOString().slice(0, 10);
  if (withScripts) {
    for (const t of tasks) {
      const last = t.rounds[t.rounds.length - 1];
      const cell = `${t.avatarCode} × ${t.awareness.replace("-Aware", "")}`;
      if (t.status === "changes" && last?.decidedAt && t.dueOn >= today) { // past due = OVERDUE in Needs me
        const since = Date.parse(last.decidedAt);
        out.push({ key: `s-${t.id}`, what: `${cell} · ${t.angle} · revision`, who: t.copywriter, since, text: ago(since, now), late: false });
      } else if (t.status === "approved" && last?.decidedAt) {
        const since = Date.parse(last.decidedAt);
        out.push({ key: `s-${t.id}`, what: `${cell} · ${t.angle} · script approved, details not confirmed`, who: t.copywriter, since, text: ago(since, now), late: now - since >= 864e5 });
      }
    }
  }
  for (const r of videoRows) {
    if (r.hold) {
      const since = Date.parse(r.hold.since);
      out.push({ key: `v-${r.taskId}`, what: `${r.name} · ${r.meta} · on hold${r.hold.reason ? `: ${r.hold.reason}` : ""}`, who: "a founder to resume it", since, text: ago(since, now), late: false });
      continue;
    }
    // Waiting on Founder 2 (Needs me), or footage after the shoot day (a FOOTAGE item): not Blocked.
    if (r.waitingOn === "You" || r.waitingWhat === "footage") continue;
    const who = r.waitingOn === "Agency" ? "the agency" : r.waitingName;
    const ahead = r.waitingWhat.startsWith("shoot ") && r.waitingWhat !== "shoot date not set";
    out.push({ key: `v-${r.taskId}`, what: `${r.name} · ${r.meta} · ${r.waitingWhat}`, who, since: ahead ? now : r.sinceMs, text: ahead ? r.nowLabel : ago(r.sinceMs, now), late: r.late });
  }
  // Late first, then the longest waiting.
  return out.sort((a, b) => Number(b.late) - Number(a.late) || a.since - b.since);
}

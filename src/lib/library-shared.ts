/**
 * Library (handoff §7, artboard "Library"): every concept whose details were confirmed (scripts handed to production,
 * and testimonials), with its record: face, main argument, offer, who made it, days per step, hooks, links.
 * Results (state, best CPA vs line, per-hook CPA and script parts) come from concept_results (daily Meta pull).
 */
import type { EditRound } from "./editing-shared";
import { isHeld, type ConceptResult, type Production, type ScriptDetails, type TaskRow } from "./tasks-shared";

export type LibState = "production" | "hold" | "testing" | "won" | "deteriorating" | "fading" | "recovering" | "lost";
export const LIB_STATE: Record<LibState, { word: string; tone: string }> = {
  production: { word: "IN PRODUCTION", tone: "t-grey" },
  hold: { word: "ON HOLD", tone: "t-hold" },
  testing: { word: "TESTING", tone: "t-amber" },
  won: { word: "WON", tone: "t-green" },
  deteriorating: { word: "DETERIORATING", tone: "t-orange" },
  fading: { word: "FADING", tone: "t-red" },
  recovering: { word: "RECOVERING", tone: "t-blue" },
  lost: { word: "LOST", tone: "t-grey" },
};
export const LIB_STATE_ORDER: LibState[] = ["won", "deteriorating", "fading", "recovering", "testing", "production", "hold", "lost"];
export const STEP_NAMES = ["Writing", "Review", "Details", "Agency", "Editing", "Launch"] as const;

export type LibHook = { v: number; type: string; line: string; headline: string | null; name: string };
export type LibLink = { label: string; url: string };
export type LibRow = {
  taskId: string;
  name: string;
  avatarCode: string;
  awareness: string;
  cell: string;
  angleId: string;
  angle: string;
  format: string;
  formatKey: string;
  mainArgumentId: string;
  offer: number | null;
  copywriter: string;
  editor: string | null;
  testimonial: boolean;
  startedAt: string;
  approvedAt: string | null;
  launchedAt: string | null;
  state: LibState;
  /** Days spent per step (Writing · Review · Details · Agency · Editing · Launch); the current step counts up to now. */
  days: number[];
  done: boolean;
  hooks: LibHook[];
  looms: LibLink[];
  links: LibLink[];
  /** Meta result when the viewer may see it (founders all, a copywriter her own). */
  result: ConceptResult | null;
  /** Static (IMG): no opening / hold. */
  isStatic: boolean;
};

const d = (from: string | null | undefined, to: string | number | null | undefined) =>
  from && to !== null && to !== undefined ? Math.max(0, ((typeof to === "number" ? to : Date.parse(to)) - Date.parse(from)) / 864e5) : 0;
const r1 = (x: number) => Math.round(x * 10) / 10;
const shortDay = (iso: string) => new Date(Date.parse(iso) + 36e5).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function buildLibrary(
  tasks: TaskRow[],
  details: Record<string, ScriptDetails>,
  productions: Record<string, Production>,
  editRounds: Map<string, EditRound[]>,
  now: number,
  results: Record<string, ConceptResult> = {},
): LibRow[] {
  const out: LibRow[] = [];
  for (const t of tasks) {
    const det = details[t.id];
    if (t.status !== "details_done" || !det) continue;
    const p = productions[t.id];
    const er = editRounds.get(t.id) ?? [];
    const testimonial = t.origin === "testimonial";
    const firstSent = t.rounds[0]?.submittedAt ?? null;
    const okRound = [...t.rounds].reverse().find((x) => x.decision === "approved");
    const approvedAt = okRound?.decidedAt ?? null;
    const confirmed = det.confirmedAt;
    const footage = p?.footageAt ?? null;
    const editOk = er.find((x) => x.decision === "approved")?.decidedAt ?? null;
    const launched = p?.launchedAt ?? null;
    const gen = det.generate || t.formatCode === "AI";
    // Each step runs to the next milestone, or to now while it is the current one.
    const end = (x: string | null) => x ?? now;
    const days = testimonial
      ? [0, 0, 0, 0, d(t.createdAt, end(editOk)), editOk ? d(editOk, end(launched)) : 0]
      : [
          d(t.createdAt, end(firstSent)),
          firstSent ? d(firstSent, end(approvedAt)) : 0,
          approvedAt ? d(approvedAt, end(confirmed)) : 0,
          confirmed && !gen ? d(confirmed, end(footage)) : 0,
          (gen ? confirmed : footage) ? d((gen ? confirmed : footage)!, end(editOk)) : 0,
          editOk ? d(editOk, end(launched)) : 0,
        ];
    const looms: LibLink[] = [
      ...t.rounds.filter((x) => x.loom).map((x) => ({ label: `Script review · round ${x.round} · ${x.decidedAt ? shortDay(x.decidedAt) : ""}`, url: x.loom! })),
      ...er.filter((x) => x.loom).map((x) => ({ label: `Edit v${x.round} · ${x.decidedAt ? shortDay(x.decidedAt) : ""}`, url: x.loom! })),
    ];
    const links: LibLink[] = [
      t.scriptUrl ? { label: "Script ↗", url: t.scriptUrl } : null,
      p?.footageUrl ? { label: testimonial ? "Call recording ↗" : det.vo ? "VO recording ↗" : "Raw footage ↗", url: p.footageUrl } : null,
      p?.finalUrl ? { label: "Final videos ↗", url: p.finalUrl } : null,
    ].filter((x): x is LibLink => !!x && /^https?:\/\//i.test(x.url));
    out.push({
      taskId: t.id,
      name: det.face || t.angle,
      avatarCode: t.avatarCode,
      awareness: t.awareness,
      cell: `${t.avatarCode} × ${t.awareness.replace("-Aware", "")}`,
      angleId: t.angleId,
      angle: t.angle,
      format: testimonial ? "Testimonial" : gen ? "AI / 3D" : det.vo ? `${t.format} · VO` : t.format,
      formatKey: testimonial ? "Testimonial" : t.format,
      mainArgumentId: det.mainArgumentId,
      offer: det.offer,
      copywriter: testimonial ? "Support call" : t.copywriter,
      editor: p?.editorName ?? null,
      testimonial,
      startedAt: t.createdAt,
      approvedAt: testimonial ? t.createdAt : approvedAt,
      launchedAt: launched,
      state: results[t.id] ? results[t.id].state : launched ? "testing" : isHeld(p) ? "hold" : "production",
      result: results[t.id] ?? null,
      isStatic: t.formatCode === "IMG",
      days: days.map(r1),
      done: !!launched,
      hooks: det.ads.map((a) => ({ v: a.v, type: a.hookType, line: a.hookLine, headline: a.headline, name: a.adName })),
      looms,
      links,
    });
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export type LibFilter = { q: string; avatar: string; awareness: string; angle: string; format: string; hook: string; arg: string; state: string; sort: "" | "cpa" | "days" };
export const NO_FILTER: LibFilter = { q: "", avatar: "", awareness: "", angle: "", format: "", hook: "", arg: "", state: "", sort: "" };

export function filterLibrary(rows: LibRow[], f: LibFilter): LibRow[] {
  const q = f.q.trim().toLowerCase();
  const out = rows.filter((r) =>
    (!f.avatar || r.avatarCode === f.avatar) &&
    (!f.awareness || r.awareness === f.awareness) &&
    (!f.angle || r.angleId === f.angle) &&
    (!f.format || r.formatKey === f.format) &&
    (!f.hook || r.hooks.some((h) => h.type === f.hook)) &&
    (!f.arg || r.mainArgumentId === f.arg) &&
    (!f.state || r.state === f.state) &&
    (!q || [r.name, r.angle, ...r.hooks.flatMap((h) => [h.line, h.headline ?? ""])].some((s) => s.toLowerCase().includes(q))),
  );
  // Newest first by default; or best CPA (no CPA last) / most total days.
  if (f.sort === "cpa") return [...out].sort((a, b) => (a.result?.cpa7 ?? Infinity) - (b.result?.cpa7 ?? Infinity));
  if (f.sort === "days") return [...out].sort((a, b) => b.days.reduce((x, y) => x + y, 0) - a.days.reduce((x, y) => x + y, 0));
  return out;
}

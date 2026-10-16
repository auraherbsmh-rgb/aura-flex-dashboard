/**
 * The map (handoff §7, Copywriting artboard "Map"): rows = avatars (Settings → Lists), columns = the 4 awareness levels.
 * Counts are concepts (one script / testimonial = one concept). Before Meta (phase 3) a concept is Writing, In production
 * or Testing (launched, no verdict yet); won / lost / fading arrive with the Meta results.
 * Only concepts created on or after the map start date (Settings) count (founder decision Oct 16: old random tests stay out).
 */

export const LEVELS = ["Problem-Aware", "Solution-Aware", "Product-Aware", "Most-Aware"] as const;
export const LEVEL_SHORT: Record<string, string> = { "Problem-Aware": "Problem", "Solution-Aware": "Solution", "Product-Aware": "Product", "Most-Aware": "Most" };

export type MapVariation = { v: number; type: string | null; line: string; name: string };
export type MapConcept = {
  taskId: string;
  avatarId: string;
  avatarCode: string;
  awareness: string;
  angleId: string;
  angle: string;
  angleCode: string;
  track: string | null;
  format: string;
  formatCode: string;
  origin: string;
  status: string;
  copywriter: string | null;
  createdAt: string;
  face: string | null;
  generate: boolean;
  vo: boolean;
  launchedAt: string | null;
  liveAt: string | null;
  holdAt: string | null;
  variations: MapVariation[];
};

export type ConceptState = "test" | "production" | "writing";
export const STATE_WORD: Record<ConceptState, string> = { test: "TESTING", production: "IN PRODUCTION", writing: "WRITING" };

export function conceptState(c: MapConcept): ConceptState {
  if (c.launchedAt || c.liveAt) return "test";
  if (c.status === "details_done") return "production";
  return "writing";
}

export type MapCell = {
  avatarId: string;
  avatarCode: string;
  awareness: string;
  state: ConceptState | "empty";
  word: string;
  line: string;
  counts: Record<ConceptState, number>;
  concepts: MapConcept[];
};
export type MapRow = { avatarId: string; avatarCode: string; label: string; cells: MapCell[] };

/** Tunisia calendar day of a timestamp (UTC+1, no daylight saving). */
const tunisDay = (iso: string) => new Date(Date.parse(iso) + 36e5).toISOString().slice(0, 10);

/** Concepts on the map: on or after the start date, and on this track (knee / hips; "both" and untagged angles show on both). */
export function mapConcepts(all: MapConcept[], track: "knee" | "hips", start: string | null): MapConcept[] {
  return all.filter((c) => (!start || tunisDay(c.createdAt) >= start) && (!c.track || c.track === "both" || c.track === track));
}

const plural = (n: number, one: string, many = `${one}`) => `${n} ${n === 1 ? one : many}`;

export function buildMap(concepts: MapConcept[], avatars: { id: string; code: string | null; label: string }[]): MapRow[] {
  return avatars.map((a) => ({
    avatarId: a.id,
    avatarCode: a.code ?? a.label,
    label: a.label,
    cells: LEVELS.map((lvl) => {
      const list = concepts.filter((c) => c.avatarId === a.id && c.awareness === lvl);
      const counts: Record<ConceptState, number> = { test: 0, production: 0, writing: 0 };
      for (const c of list) counts[conceptState(c)]++;
      const state: MapCell["state"] = counts.test ? "test" : counts.production ? "production" : counts.writing ? "writing" : "empty";
      const parts = [
        counts.test ? plural(counts.test, "testing") : "",
        counts.production ? `${counts.production} in production` : "",
        counts.writing ? `${counts.writing} writing` : "",
      ].filter(Boolean);
      return {
        avatarId: a.id, avatarCode: a.code ?? a.label, awareness: lvl, state,
        word: state === "empty" ? "EMPTY" : state === "test" ? "TEST" : state === "production" ? "IN PROD" : "WRITING",
        line: parts.length ? parts.join(" · ") : "+ Propose a test",
        counts, concepts: list,
      };
    }),
  }));
}

export type AngleGroup = { angleId: string; angle: string; angleCode: string; concepts: MapConcept[]; counts: Record<ConceptState, number> };

/** Cell view: the cell's concepts grouped by angle (most concepts first), newest concept first inside each angle. */
export function groupByAngle(concepts: MapConcept[]): AngleGroup[] {
  const by = new Map<string, AngleGroup>();
  for (const c of concepts) {
    const g = by.get(c.angleId) ?? { angleId: c.angleId, angle: c.angle, angleCode: c.angleCode, concepts: [], counts: { test: 0, production: 0, writing: 0 } };
    g.concepts.push(c);
    g.counts[conceptState(c)]++;
    by.set(c.angleId, g);
  }
  const out = [...by.values()];
  for (const g of out) g.concepts.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return out.sort((a, b) => b.concepts.length - a.concepts.length || a.angle.localeCompare(b.angle));
}

/** Mix in a cell or angle: how many concepts per format and per hook type (facts only, like CHANGE). */
export function mix(concepts: MapConcept[]) {
  const formats = new Map<string, number>();
  const hooks = new Map<string, number>();
  for (const c of concepts) {
    const f = c.origin === "testimonial" ? "Testimonial" : c.format;
    formats.set(f, (formats.get(f) ?? 0) + 1);
    for (const v of c.variations) if (v.type) hooks.set(v.type, (hooks.get(v.type) ?? 0) + 1);
  }
  const sort = (m: Map<string, number>) => [...m.entries()].sort((a, b) => b[1] - a[1]);
  return { formats: sort(formats), hooks: sort(hooks) };
}

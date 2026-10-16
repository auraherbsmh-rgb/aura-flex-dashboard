/**
 * The map (handoff §7, Copywriting artboard "Map"): rows = avatars (Settings → Lists), columns = the 4 awareness levels.
 * Counts are concepts (one script / testimonial = one concept): Writing, In production, then once launched its Meta state
 * (daily pull → concept_results): Won · Deteriorating · Fading · Recovering · Testing · Lost.
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
  /** Meta state from the daily pull (null = no Meta data yet). */
  resultState?: "won" | "deteriorating" | "fading" | "recovering" | "testing" | "lost" | null;
  everWon?: boolean;
};

export type ConceptState = "won" | "deteriorating" | "fading" | "recovering" | "test" | "production" | "writing" | "lost";
/** Best first (handoff §7 cell order: Winning > Deteriorating > Fading > Recovering > Testing > … > Lost > Empty). */
export const STATE_ORDER: ConceptState[] = ["won", "deteriorating", "fading", "recovering", "test", "production", "writing", "lost"];
export const STATE_WORD: Record<ConceptState, string> = {
  won: "WON", deteriorating: "DETERIORATING", fading: "FADING", recovering: "RECOVERING", test: "TESTING", production: "IN PRODUCTION", writing: "WRITING", lost: "LOST",
};
/** Short words for the map cells (handoff §7: RECOVER · TEST · WRITING). */
export const CELL_WORD: Record<ConceptState, string> = {
  won: "WON", deteriorating: "DETERIOR.", fading: "FADING", recovering: "RECOVER", test: "TEST", production: "IN PROD", writing: "WRITING", lost: "LOST",
};
export const STATE_PLAIN: Record<ConceptState, string> = {
  won: "won", deteriorating: "deteriorating", fading: "fading", recovering: "recovering", test: "testing", production: "in prod", writing: "writing", lost: "lost",
};
export const zeroCounts = (): Record<ConceptState, number> => ({ won: 0, deteriorating: 0, fading: 0, recovering: 0, test: 0, production: 0, writing: 0, lost: 0 });

export function conceptState(c: MapConcept): ConceptState {
  if (c.resultState) return c.resultState === "testing" ? "test" : c.resultState;
  if (c.launchedAt || c.liveAt) return "test";
  if (c.status === "details_done") return "production";
  return "writing";
}

export type MapCell = {
  avatarId: string;
  avatarCode: string;
  awareness: string;
  /** The best state in the cell (its box colour), or empty. */
  state: ConceptState | "empty";
  /** More than one state and none of them a Meta result: the box stays neutral; the coloured dots show each state. */
  mixed: boolean;
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


export function buildMap(concepts: MapConcept[], avatars: { id: string; code: string | null; label: string }[]): MapRow[] {
  return avatars.map((a) => ({
    avatarId: a.id,
    avatarCode: a.code ?? a.label,
    label: a.label,
    cells: LEVELS.map((lvl) => {
      const list = concepts.filter((c) => c.avatarId === a.id && c.awareness === lvl);
      const counts = zeroCounts();
      for (const c of list) counts[conceptState(c)]++;
      const present = STATE_ORDER.filter((st) => counts[st] > 0);
      // Once a concept here has a Meta result, the box takes the best Meta state (testing included); before that the
      // best state, and a mix of pre-Meta states stays neutral (founder decision Oct 16).
      const metaStates = STATE_ORDER.filter((st) => list.some((c) => c.resultState && conceptState(c) === st));
      const state = (metaStates[0] ?? present[0] ?? "empty") as MapCell["state"];
      const mixed = present.length > 1 && metaStates.length === 0;
      // ×N: concepts in the box's state (from Meta results when the box comes from them).
      const n = state === "empty" ? 0 : metaStates.length ? list.filter((c) => c.resultState && conceptState(c) === state).length : counts[state as ConceptState];
      const parts = present.map((st) => `${counts[st]} ${STATE_PLAIN[st]}`);
      return {
        avatarId: a.id, avatarCode: a.code ?? a.label, awareness: lvl, state, mixed,
        // State word + ×N (handoff §7); a neutral mixed cell says how many concepts it holds.
        word: state === "empty" ? "EMPTY" : mixed ? `${list.length} CONCEPTS` : `${CELL_WORD[state]}${n > 1 ? ` ×${n}` : ""}`,
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
    const g = by.get(c.angleId) ?? { angleId: c.angleId, angle: c.angle, angleCode: c.angleCode, concepts: [], counts: zeroCounts() };
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

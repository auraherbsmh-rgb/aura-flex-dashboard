/**
 * Copywriter scorecard (handoff §7, artboard "Scorecard" — Copywriting panel "scorecard"): her own dashboard.
 * Blocks: win rate by month · latest concepts · winners live now · script parts this month + focus (+ retention) ·
 * where I win / lose (best and worst, 3+ settled, click → its concepts or variations) · best scripts · bonus and level (off).
 * Settled = won (ever) or lost. Pure: tested in tests/meta.test.ts.
 */
import type { MapConcept } from "./map-shared";
import type { Bands, ConceptResult, Production, TaskRow } from "./tasks-shared";

const tunisMonth = (ms: number) => new Date(ms + 36e5).toISOString().slice(0, 7);
const MONTH = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const shortDay = (iso: string) => new Date(Date.parse(iso) + 36e5).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const STATE: Record<string, { word: string; tone: string }> = {
  won: { word: "WON", tone: "t-green" }, deteriorating: { word: "DETERIORATING", tone: "t-orange" }, fading: { word: "FADING", tone: "t-red" },
  recovering: { word: "RECOVERING", tone: "t-blue" }, testing: { word: "TEST", tone: "t-amber" }, lost: { word: "LOST", tone: "t-grey" },
};
const WON_STATES = new Set(["won", "deteriorating", "fading", "recovering"]);

export type MonthRate = { label: string; won: number; settled: number; improving: boolean };
export type Latest = { taskId: string; name: string; cell: string; state: string; tone: string; when: string; at: string };
export type PartAvg = { part: "Opening" | "Hold" | "Clicks"; value: number | null; low: number | null; inBand: boolean | null };
export type DrillItem = { state: string; tone: string; line: string; who: string; url: string | null };
export type WLItem = { key: string; label: string; won: number; settled: number; items: DrillItem[] };
export type WLRow = { dim: string; unit: "concept" | "variation"; best: WLItem | null; worst: WLItem | null; note: string };
export type Scorecard = {
  months: MonthRate[]; testing: number; settledTotal: number;
  latest: Latest[];
  liveWins: { label: string; tone: string }[];
  parts: PartAvg[]; partsCount: number;
  focus: { part: string; below: number; of: number } | null;
  retention: { at: number; left: number }[] | null;
  wl: WLRow[];
  best: { taskId: string; label: string; url: string | null }[];
};

type Input = {
  tasks: TaskRow[]; concepts: MapConcept[]; results: Record<string, ConceptResult>;
  productions: Map<string, Production>; bands: Bands | null; now: number;
};

const settledAt = (r: ConceptResult) => (r.everWon ? r.wonAt ?? r.stateSince : r.state === "lost" ? r.stateSince : null);

/** One concept's script parts over its judged days (videos; statics have no opening / hold). */
function rates(r: ConceptResult) {
  const t = r.totals;
  if (!t || !t.impressions) return null;
  return { hook: t.plays3s / t.impressions, hold: t.plays3s ? t.thruplays / t.plays3s : null, ctr: t.clicks / t.impressions, t };
}

export function buildScorecard({ tasks, concepts, results, productions, bands, now }: Input): Scorecard {
  const byTask = new Map(concepts.map((c) => [c.taskId, c]));
  const mine = tasks.map((t) => ({ t, c: byTask.get(t.id), r: results[t.id] })).filter((x) => x.c);
  const cellOf = (t: TaskRow) => `${t.avatarCode} × ${t.awareness.replace("-Aware", "")}`;
  const nameOf = (x: { t: TaskRow; c?: MapConcept }) => x.c?.face ?? x.t.angle;

  // 1. Win rate by month (last 3 months, by the month the verdict came) + still testing.
  const months: MonthRate[] = [];
  const cur = new Date(now + 36e5);
  for (let i = 2; i >= 0; i--) {
    const d = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() - i, 15));
    const key = d.toISOString().slice(0, 7);
    let won = 0, settled = 0;
    for (const x of mine) {
      if (!x.r) continue;
      const at = settledAt(x.r);
      if (!at || tunisMonth(Date.parse(at)) !== key) continue;
      settled++;
      if (x.r.everWon) won++;
    }
    months.push({ label: MONTH[d.getUTCMonth()], won, settled, improving: false });
  }
  const pct = (m: MonthRate) => (m.settled ? m.won / m.settled : null);
  const last = months[2], prev = months[1];
  last.improving = pct(last) !== null && pct(prev) !== null && (pct(last) as number) > (pct(prev) as number);
  const testing = mine.filter((x) => (x.r ? x.r.state === "testing" && !x.r.everWon : !!(x.c?.launchedAt || x.c?.liveAt))).length;
  const settledAll = mine.filter((x) => x.r && settledAt(x.r));

  // 2. Latest concepts (launched): the newest event first (a verdict, else the launch).
  const latest: Latest[] = mine
    .filter((x) => x.c?.launchedAt || x.c?.liveAt || x.r)
    .map((x) => {
      const r = x.r;
      const st = r ? STATE[r.everWon && r.state === "testing" ? "won" : r.state] : STATE.testing;
      const at = (r && settledAt(r)) ?? x.c?.liveAt ?? x.c?.launchedAt ?? x.t.createdAt;
      const live = x.c?.liveAt ?? x.c?.launchedAt;
      const when = r && settledAt(r) ? `settled ${shortDay(settledAt(r)!)}` : live ? `live ${Math.max(1, Math.round((now - Date.parse(live)) / 864e5))} day${Math.round((now - Date.parse(live)) / 864e5) === 1 ? "" : "s"}` : "launched";
      return { taskId: x.t.id, name: nameOf(x), cell: cellOf(x.t), state: st.word, tone: st.tone, when, at };
    })
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, 5);

  // 3. Winners live now.
  const liveWins = mine
    .filter((x) => x.r?.live && x.r.everWon && WON_STATES.has(x.r.state))
    .map((x) => ({ label: `${nameOf(x).toUpperCase()} · ${STATE[x.r!.state].word}`, tone: STATE[x.r!.state].tone }));

  // 4. Script parts this month: her video concepts launched in the last 30 days, weighted by impressions.
  const recent = mine.filter((x) => x.r && x.c && x.c.formatCode !== "IMG" && Date.parse(x.c.launchedAt ?? x.c.liveAt ?? x.t.createdAt) >= now - 30 * 864e5 && rates(x.r));
  const sumT = recent.reduce((a, x) => {
    const t = x.r!.totals!;
    return { impressions: a.impressions + t.impressions, plays3s: a.plays3s + t.plays3s, thruplays: a.thruplays + t.thruplays, clicks: a.clicks + t.clicks, p25: a.p25 + t.p25, p50: a.p50 + t.p50, p75: a.p75 + t.p75, p100: a.p100 + t.p100 };
  }, { impressions: 0, plays3s: 0, thruplays: 0, clicks: 0, p25: 0, p50: 0, p75: 0, p100: 0 });
  const minImp = bands?.minImpressions ?? 0;
  const enough = sumT.impressions > 0 && sumT.impressions >= minImp;
  const P = (part: PartAvg["part"], v: number | null, low: number | null): PartAvg => ({ part, value: v, low, inBand: v === null || low === null ? null : v * 100 >= low });
  const parts: PartAvg[] = [
    P("Opening", enough ? sumT.plays3s / sumT.impressions : null, bands?.hook ?? null),
    P("Hold", enough && sumT.plays3s ? sumT.thruplays / sumT.plays3s : null, bands?.hold ?? null),
    P("Clicks", enough ? sumT.clicks / sumT.impressions : null, bands?.ctrVideo ?? null),
  ];
  const retention = enough && sumT.plays3s ? [25, 50, 75, 100].map((at) => ({ at, left: sumT[`p${at}` as "p25"] / sumT.plays3s })) : null;

  // Focus: the part below its band in most of her last 10 settled video concepts.
  const last10 = settledAll.filter((x) => x.c?.formatCode !== "IMG" && rates(x.r!)).sort((a, b) => settledAt(b.r!)!.localeCompare(settledAt(a.r!)!)).slice(0, 10);
  let focus: Scorecard["focus"] = null;
  if (bands && last10.length >= 3) {
    const below = { Opening: 0, Hold: 0, Clicks: 0 };
    for (const x of last10) {
      const q = rates(x.r!)!;
      if (bands.hook !== null && q.hook * 100 < bands.hook) below.Opening++;
      if (bands.hold !== null && q.hold !== null && q.hold * 100 < bands.hold) below.Hold++;
      if (bands.ctrVideo !== null && q.ctr * 100 < bands.ctrVideo) below.Clicks++;
    }
    const top = (Object.entries(below) as [string, number][]).sort((a, b) => b[1] - a[1])[0];
    if (top[1] > 0) focus = { part: top[0], below: top[1], of: last10.length };
  }

  // 5. Where I win and where I lose: per concept (format, avatar, awareness, angle) and per variation (hook type).
  const watch = (taskId: string) => productions.get(taskId)?.finalUrl ?? null;
  const conceptDim = (dim: string, keyOf: (x: (typeof mine)[number]) => string): WLRow => {
    const groups = new Map<string, WLItem>();
    for (const x of settledAll) {
      const k = keyOf(x);
      const g = groups.get(k) ?? { key: `${dim}:${k}`, label: k, won: 0, settled: 0, items: [] };
      g.settled++;
      if (x.r!.everWon) g.won++;
      const st = STATE[x.r!.everWon ? "won" : "lost"];
      g.items.push({ state: st.word, tone: st.tone, line: x.c?.variations[0]?.line ?? x.t.angle, who: `${nameOf(x)} · ${cellOf(x.t)}`, url: watch(x.t.id) });
      groups.set(k, g);
    }
    return pickBestWorst(dim, "concept", [...groups.values()]);
  };
  const hookRow = (): WLRow => {
    const groups = new Map<string, WLItem>();
    for (const x of mine) {
      if (!x.r || !x.c) continue;
      for (const v of x.r.variations) {
        if (v.state !== "lost" && !WON_STATES.has(v.state)) continue;
        const meta = x.c.variations.find((m) => m.v === v.v);
        const k = meta?.type ?? "Testimonial";
        const g = groups.get(k) ?? { key: `hook:${k}`, label: k, won: 0, settled: 0, items: [] };
        g.settled++;
        const won = WON_STATES.has(v.state);
        if (won) g.won++;
        const st = STATE[won ? "won" : "lost"];
        g.items.push({ state: st.word, tone: st.tone, line: meta?.line ?? "", who: `${nameOf(x)} V${v.v} · ${cellOf(x.t)}`, url: watch(x.t.id) });
        groups.set(k, g);
      }
    }
    return pickBestWorst("Hook type", "variation", [...groups.values()]);
  };
  const wl: WLRow[] = [
    hookRow(),
    conceptDim("Format", (x) => (x.t.origin === "testimonial" ? "Testimonial" : x.c?.generate ? "AI / 3D" : x.t.format)),
    conceptDim("Avatar", (x) => x.t.avatarCode),
    conceptDim("Awareness", (x) => x.t.awareness.replace("-Aware", "")),
    conceptDim("Angle", (x) => x.t.angle),
  ];

  // 6. Best scripts: her two winners with the lowest CPA.
  const best = mine
    .filter((x) => x.r?.everWon)
    .sort((a, b) => (a.r!.cpa7 ?? Infinity) - (b.r!.cpa7 ?? Infinity))
    .slice(0, 2)
    .map((x) => ({ taskId: x.t.id, label: `${nameOf(x)} · ${cellOf(x.t)}`, url: x.t.scriptUrl }));

  return { months, testing, settledTotal: settledAll.length, latest, liveWins, parts, partsCount: recent.length, focus, retention, wl, best };
}

/** Best = highest win rate, worst = lowest, among items with 3 or more settled; worst only when it differs from best. */
function pickBestWorst(dim: string, unit: WLRow["unit"], items: WLItem[]): WLRow {
  const ok = items.filter((g) => g.settled >= 3).sort((a, b) => b.won / b.settled - a.won / a.settled || b.settled - a.settled);
  // Winners first inside each list (the drill shows what worked, then what did not).
  for (const g of ok) g.items.sort((a, b) => Number(b.state !== "LOST") - Number(a.state !== "LOST"));
  if (!ok.length) return { dim, unit, best: null, worst: null, note: "not enough yet" };
  const best = ok[0];
  const worst = ok.length > 1 ? ok[ok.length - 1] : null;
  const same = worst && worst.won / worst.settled === best.won / best.settled;
  return { dim, unit, best, worst: same ? null : worst, note: !worst ? `only one ${dim.toLowerCase()} with 3+ settled` : same ? "all at the same rate" : "" };
}

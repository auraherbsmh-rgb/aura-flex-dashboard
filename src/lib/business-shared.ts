/**
 * Business · Money (handoff §10, artboard "Business"): "Are we making money?" Pure maths, tested in tests/business.test.ts.
 *
 * One profit model, the same as File 1 §2 (the business line):
 *   delivered D = (website leads + DM leads) × confirmation × door rate
 *   profit = D × (order value − bottles × bottle cost − delivery cost per order) − fixed and salaries − Meta spend × rate
 * with website leads = Meta purchases ÷ tracking and DM leads = Meta purchases × DM per purchase.
 * The leak finder switches the stages one at a time from the previous month to this one, in a fixed order, so the
 * stages add up exactly to the change in profit.
 */

export type ShipperOrder = {
  orderId: string; orderedAt: string; channel: "website" | "dm"; bottles: number; totalTnd: number;
  status: "new" | "confirmed" | "shipped" | "delivered" | "returned" | "cancelled";
  reason: "duplicate" | "disqualified" | "unreachable" | "wrong_number" | "other" | null;
  deliveryCostTnd: number | null; shippedAt: string | null; settledAt: string | null;
};
export type MetaPeriod = { purchases: number; spendUsd: number };
export type MoneyBase = { exchangeRate: number; bottleCostTnd: number; deliveryCostTnd: number; fixedCostsTnd: number; businessLineUsd: number };

/** Tunisia (UTC+1) helpers. */
export const tunisDay = (ms: number) => new Date(ms + 36e5).toISOString().slice(0, 10);
export const monthOf = (iso: string) => tunisDay(Date.parse(iso)).slice(0, 7);
const SHIPPED = new Set(["shipped", "delivered", "returned"]);

export type Funnel = {
  webLeads: number; dmLeads: number; shipped: number; delivered: number; returned: number;
  /** Shipped, not delivered or returned yet. */ open: number;
  /** New or confirmed, not shipped yet (no confirmation verdict). */ pending: number;
  revenue: number; bottles: number; deliveryCost: number;
  webShipped: number; reasons: Record<"duplicate" | "disqualified" | "unreachable" | "wrong_number", number>;
  door: { b1: [number, number]; b2: [number, number]; b3: [number, number] }; // [delivered, settled] per order size
};

/** Counts for a set of orders (one month or one week, by order date). Delivery cost: the order's own, else Settings. */
export function funnel(orders: ShipperOrder[], m: MoneyBase): Funnel {
  const f: Funnel = {
    webLeads: 0, dmLeads: 0, shipped: 0, delivered: 0, returned: 0, open: 0, pending: 0, revenue: 0, bottles: 0, deliveryCost: 0, webShipped: 0,
    reasons: { duplicate: 0, disqualified: 0, unreachable: 0, wrong_number: 0 }, door: { b1: [0, 0], b2: [0, 0], b3: [0, 0] },
  };
  for (const o of orders) {
    if (o.channel === "website") f.webLeads++; else f.dmLeads++;
    if (o.channel === "website" && o.reason && o.reason !== "other") f.reasons[o.reason]++;
    if (o.status === "new" || o.status === "confirmed") { f.pending++; continue; }
    if (!SHIPPED.has(o.status)) continue;
    f.shipped++;
    if (o.channel === "website") f.webShipped++;
    if (o.status === "shipped") { f.open++; continue; }
    const size = o.bottles >= 3 ? "b3" : o.bottles === 2 ? "b2" : "b1";
    f.door[size][1]++;
    if (o.status === "returned") { f.returned++; continue; }
    f.door[size][0]++;
    f.delivered++;
    f.revenue += o.totalTnd;
    f.bottles += o.bottles;
    f.deliveryCost += o.deliveryCostTnd ?? m.deliveryCostTnd;
  }
  return f;
}

export type Params = { M: number; cpa: number; tau: number; dm: number; c: number; r: number; v: number; k: number; F: number; X: number };

/**
 * The model's inputs for one closed month. Open orders get File 1's rule: orders not confirmed yet count at the month's
 * confirmation rate, orders in transit at its door rate (delivered ÷ settled); the month is then PROVISIONAL.
 */
export function params(f: Funnel, meta: MetaPeriod, m: MoneyBase, fixedTnd: number): Params {
  const leads = f.webLeads + f.dmLeads;
  const decided = leads - f.pending;
  const settled = f.delivered + f.returned;
  const aov = f.delivered ? f.revenue / f.delivered : 0;
  const bpo = f.delivered ? f.bottles / f.delivered : 0;
  return {
    M: meta.purchases, cpa: meta.purchases ? meta.spendUsd / meta.purchases : 0,
    tau: f.webLeads ? meta.purchases / f.webLeads : 1, dm: meta.purchases ? f.dmLeads / meta.purchases : 0,
    c: decided ? f.shipped / decided : 0, r: settled ? f.delivered / settled : 0,
    v: aov - bpo * m.bottleCostTnd, k: f.delivered ? f.deliveryCost / f.delivered : m.deliveryCostTnd, F: fixedTnd, X: m.exchangeRate,
  };
}

export const delivered = (p: Params) => (p.tau ? p.M / p.tau : 0) * p.c * p.r + p.M * p.dm * p.c * p.r;
export const profitOf = (p: Params) => delivered(p) * (p.v - p.k) - p.F - p.M * p.cpa * p.X;
/**
 * Delivered orders and profit from the actual leads (equal to the model whenever Meta purchases > 0; still right when a
 * month or week has Shipper orders but no Meta purchases pulled).
 */
export const deliveredFromLeads = (f: Funnel, p: Params) => (f.webLeads + f.dmLeads) * p.c * p.r;
export const profitFromLeads = (f: Funnel, p: Params, spendUsd: number) => deliveredFromLeads(f, p) * (p.v - p.k) - p.F - spendUsd * p.X;

export type Leak = { key: "ads" | "volume" | "tracking" | "conf" | "door" | "aov" | "delivery" | "fixed"; name: string; what: string; amount: number };

/** Stages switched in fixed order: ad cost → volume → tracking → confirmation → door rate → order value → delivery cost → fixed. */
export function leakFinder(prev: Params, cur: Params): { stages: Leak[]; total: number } {
  const order: [Leak["key"], (keyof Params)[], string, string][] = [
    ["ads", ["cpa"], "Ad cost", "CPA"],
    ["volume", ["M"], "Volume", "Fixed costs per order"],
    ["tracking", ["tau", "dm"], "Tracking", "Meta purchases ÷ website leads · DM per purchase"],
    ["conf", ["c"], "Confirmation", "Leads → shipped"],
    ["door", ["r"], "Door rate", "Shipped → delivered"],
    ["aov", ["v"], "Order value", "Net of bottle cost"],
    ["delivery", ["k"], "Delivery cost", "Per delivered order"],
    ["fixed", ["F"], "Salaries and fixed", "Fixed costs and salaries"],
  ];
  let p = { ...prev };
  const stages: Leak[] = [];
  for (const [key, fields, name, what] of order) {
    const before = profitOf(p);
    const next = { ...p };
    for (const k of fields) (next as Record<string, number>)[k] = cur[k];
    // Exchange rate moves with ad cost (spend is converted at the current rate).
    if (key === "ads") next.X = cur.X;
    stages.push({ key, name, what, amount: profitOf(next) - before });
    p = next;
  }
  return { stages, total: profitOf(cur) - profitOf(prev) };
}

/** Profit colour (artboard): green = CPA more than 5% under the line · orange = within 5% · red = more than 5% over. */
export function lineZone(cpa: number | null, line: number): "green" | "orange" | "red" | "grey" {
  if (cpa === null || !line) return "grey";
  const d = (cpa - line) / line;
  return d < -0.05 ? "green" : d > 0.05 ? "red" : "orange";
}

/** Weekly estimate (week view, settling weeks): Meta purchases × line − spend, in TND (the line already holds every cost). */
export const estimateProfit = (meta: MetaPeriod, m: MoneyBase) => (meta.purchases * m.businessLineUsd - meta.spendUsd) * m.exchangeRate;

/** Mondays (Tunisia) of the last n full weeks, oldest first, and the current week's Monday. */
export function weekStarts(now: number, n: number): string[] {
  const today = tunisDay(now);
  const dow = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  const thisMon = Date.parse(`${today}T12:00:00Z`) - dow * 864e5;
  return Array.from({ length: n }, (_, i) => new Date(thisMon - (n - i) * 7 * 864e5).toISOString().slice(0, 10));
}

/** "LOSS 6 WEEKS" / "IMPROVING 2 WEEKS": the current streaks at the end of the trend. */
export function streaks(values: number[]) {
  let loss = 0;
  for (let i = values.length - 1; i >= 0 && values[i] < 0; i--) loss++;
  let up = 0;
  for (let i = values.length - 1; i > 0 && values[i] > values[i - 1]; i--) up++;
  let down = 0;
  for (let i = values.length - 1; i > 0 && values[i] < values[i - 1]; i--) down++;
  let gain = 0;
  for (let i = values.length - 1; i >= 0 && values[i] >= 0; i--) gain++;
  return { loss, gain, up, down };
}

/* ───────────── The Money view model ───────────── */

export type MetaDayTotal = { day: string; purchases: number; spendUsd: number };
export type Waterfall = { label: string; sub: string; amount: number; left: number | null; pct: number };
export type LeakRow = Leak & { rate: string; detail: { head: string; lines: { a: string; b: string; bad: boolean }[]; look: string } | null; grey: boolean; shown: number };
export type ClosedMonth = {
  label: string; prevLabel: string; profit: number; prevProfit: number | null; zone: ReturnType<typeof lineZone>; cpa: number | null; line: number;
  metaOrders: number; dmOrders: number; gross: number; grossPrev: number | null; delivered: number; open: number; provisional: boolean;
  aov: number; waterfall: Waterfall[]; leaks: LeakRow[] | null; leakTotal: number | null; leakWhy: string | null; tracking: number | null; lineStatus: string;
  fixed: number; estimatedDelivered: number; noMeta: boolean;
};
export type TrendNote = { noMetaWeeks: number };
export type WeekView = { label: string; profit: number; prevProfit: number; zone: ReturnType<typeof lineZone>; cpa: number | null; metaOrders: number; dmOrders: number | null; grossSoFar: number | null; pace: number | null; monthLabel: string; closedLabel: string };
export type TrendPoint = { monday: string; profit: number; settling: boolean };
export type MoneyView = { closed: ClosedMonth | null; week: WeekView; trend: TrendPoint[]; hasShipper: boolean };
export type MonthBase = { month: string; status: string; base: MoneyBase };

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const monthName = (ym: string) => MONTHS[Number(ym.slice(5, 7)) - 1];
const addMonths = (ym: string, n: number) => { const d = new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)) - 1 + n, 15)); return d.toISOString().slice(0, 7); };
const daysIn = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).getUTCDate();
const pct1 = (n: number) => `${(n * 100).toFixed(1)}%`;
const tnd0 = (n: number) => Math.round(n).toLocaleString("en-US");

function metaFor(days: MetaDayTotal[], from: string, to: string): MetaPeriod {
  return days.filter((d) => d.day >= from && d.day <= to).reduce((a, d) => ({ purchases: a.purchases + d.purchases, spendUsd: a.spendUsd + d.spendUsd }), { purchases: 0, spendUsd: 0 });
}

/** The money numbers in force for a month: the Settings row of that month, else the closest earlier one, else the oldest. */
export function baseFor(bases: MonthBase[], ym: string): MonthBase {
  const sorted = [...bases].sort((a, b) => a.month.localeCompare(b.month));
  return [...sorted].reverse().find((b) => b.month.slice(0, 7) <= ym) ?? sorted[0];
}

/** HOUSE RULE (not in File 1): tracking + delivery-cost moves this small stay one grey "normal swing" row. */
const GREY_TND = 300, GREY_SHARE = 0.05;

export function buildMoney(input: { orders: ShipperOrder[]; metaDays: MetaDayTotal[]; bases: MonthBase[]; now: number }): MoneyView {
  const { orders, metaDays, bases, now } = input;
  const thisMonth = tunisDay(now).slice(0, 7);
  const closedYm = addMonths(thisMonth, -1);
  const prevYm = addMonths(thisMonth, -2);
  const m = baseFor(bases, thisMonth).base;
  const hasShipper = orders.length > 0;
  const ordersIn = (ym: string) => orders.filter((o) => monthOf(o.orderedAt) === ym);
  const metaMonth = (ym: string) => metaFor(metaDays, `${ym}-01`, `${ym}-${String(daysIn(ym)).padStart(2, "0")}`);

  let closed: ClosedMonth | null = null;
  if (hasShipper) {
    const mb = baseFor(bases, closedYm);
    const f = funnel(ordersIn(closedYm), mb.base);
    const meta = metaMonth(closedYm);
    const p = params(f, meta, mb.base, mb.base.fixedCostsTnd);
    const pb = baseFor(bases, prevYm);
    const fPrev = funnel(ordersIn(prevYm), pb.base);
    const metaPrev = metaMonth(prevYm);
    const usable = (fx: Funnel, mx: MetaPeriod) => fx.webLeads > 0 && mx.purchases > 0 && fx.delivered + fx.returned > 0;
    const pPrev = usable(fPrev, metaPrev) ? params(fPrev, metaPrev, pb.base, pb.base.fixedCostsTnd) : null;
    // Profit = the model: equal to the books when every order has settled; open orders estimated (File 1) otherwise.
    const profit = profitFromLeads(f, p, meta.spendUsd);
    const prevProfit = pPrev ? profitOf(pPrev) : null;
    const dEst = deliveredFromLeads(f, p);
    const aov = f.delivered ? f.revenue / f.delivered : 0;
    const bpo = f.delivered ? f.bottles / f.delivered : 0;
    const gross = dEst * aov;
    const product = dEst * bpo * mb.base.bottleCostTnd;
    const deliveryCost = dEst * p.k;
    const ads = meta.spendUsd * mb.base.exchangeRate;
    const provisional = f.open + f.pending > 0;
    const cpa = meta.purchases ? meta.spendUsd / meta.purchases : null;
    let left = gross;
    const w = (label: string, sub: string, amount: number): Waterfall => { left += amount; return { label, sub, amount, left, pct: gross ? Math.abs(amount) / gross : 0 }; };
    const waterfall: Waterfall[] = [
      { label: "Gross sales", sub: `${tnd0(dEst)} delivered orders${provisional ? " (open ones estimated)" : ""}`, amount: gross, left: null, pct: 1 },
      w("Product", `${tnd0(dEst * bpo)} bottles × ${mb.base.bottleCostTnd}`, -product),
      w("Delivery", `${p.k.toFixed(2)} per order`, -deliveryCost),
      w("Ads", `$${tnd0(meta.spendUsd)} × ${mb.base.exchangeRate}`, -ads),
      w("Salaries and fixed", `${tnd0(mb.base.fixedCostsTnd)} per month`, -mb.base.fixedCostsTnd),
    ];
    waterfall.push({ label: "Profit", sub: profit < 0 ? `costs exceed gross by ${Math.round((-profit / (gross || 1)) * 100)}%` : `${Math.round((profit / (gross || 1)) * 100)}% of gross kept`, amount: profit, left: null, pct: gross ? profit / gross : 0 });

    let leaks: LeakRow[] | null = null;
    let leakTotal: number | null = null;
    let leakWhy: string | null = null;
    if (!usable(f, meta)) leakWhy = `${monthName(closedYm)} has no settled orders or Meta purchases yet`;
    else if (!pPrev) leakWhy = `needs ${monthName(prevYm)} in the Shipper data`;
    else {
      const lf = leakFinder(pPrev, p);
      leakTotal = lf.total;
      const g = lf.stages.filter((x) => x.key === "tracking" || x.key === "delivery");
      const gAmount = g.reduce((n, x) => n + x.amount, 0);
      // Grey ("inside normal swing") only while small; a big tracking or delivery-cost move is a real stage.
      const small = Math.abs(gAmount) < Math.max(GREY_TND, GREY_SHARE * Math.abs(lf.total));
      const greyRow: LeakRow = {
        key: "tracking", name: "Tracking and delivery cost", what: small ? `Inside normal swing (under ${GREY_TND} TND or ${GREY_SHARE * 100}% of the change · house rule)` : "Tracking ratio or delivery cost moved",
        amount: gAmount, rate: `${pPrev.tau.toFixed(3)} → ${p.tau.toFixed(3)}`, detail: small ? null : {
          head: "Meta purchases per website lead, DM orders per Meta purchase, and delivery cost per delivered order.",
          lines: [
            { a: "Tracking · Meta purchases ÷ website leads", b: `${pPrev.tau.toFixed(3)} → ${p.tau.toFixed(3)}`, bad: p.tau < 0.89 || p.tau > 0.95 },
            { a: "DM orders per Meta purchase", b: `${pPrev.dm.toFixed(3)} → ${p.dm.toFixed(3)}`, bad: p.dm < pPrev.dm },
            { a: "Delivery cost per delivered order", b: `${pPrev.k.toFixed(2)} → ${p.k.toFixed(2)} TND`, bad: p.k > pPrev.k },
          ],
          look: "the tracking band (0.89–0.95: outside it, tracking broke), DM order handling and Shipper's delivery fees.",
        }, grey: small, shown: 0,
      };
      const door = (fx: Funnel, k: "b1" | "b2" | "b3") => (fx.door[k][1] ? pct1(fx.door[k][0] / fx.door[k][1]) : "—");
      const share = (n: number, fx: Funnel) => (fx.webLeads ? pct1(n / fx.webLeads) : "—");
      const L = (head: string, lines: { a: string; b: string; bad: boolean }[], look: string) => ({ head, lines, look });
      const rows: LeakRow[] = lf.stages.filter((x) => x.key !== "tracking" && x.key !== "delivery" && !(x.key === "fixed" && Math.abs(x.amount) < 0.5)).map((x): LeakRow => {
        switch (x.key) {
          case "conf": return { ...x, grey: false, shown: 0, rate: `${pct1(pPrev.c)} → ${pct1(p.c)}`, detail: L(
            `All leads → shipped ${pct1(pPrev.c)} → ${pct1(p.c)}. Website confirmation ${fPrev.webLeads ? pct1(fPrev.webShipped / fPrev.webLeads) : "—"} → ${f.webLeads ? pct1(f.webShipped / f.webLeads) : "—"} (DM orders are confirmed by definition).`,
            (["disqualified", "duplicate", "unreachable", "wrong_number"] as const).map((r) => ({
              a: `${r === "wrong_number" ? "Wrong number" : r[0].toUpperCase() + r.slice(1)} · share of website leads`,
              b: `${share(fPrev.reasons[r], fPrev)} → ${share(f.reasons[r], f)}`,
              bad: f.webLeads > 0 && fPrev.webLeads > 0 && f.reasons[r] / f.webLeads > fPrev.reasons[r] / fPrev.webLeads + 0.01,
            })),
            "the reason that grew most. Ask the confirmation team whether the criteria changed.") };
          case "door": return { ...x, grey: false, shown: 0, rate: `${pct1(pPrev.r)} → ${pct1(p.r)}`, detail: L(
            `Shipped → delivered ${pct1(pPrev.r)} → ${pct1(p.r)} (all channels, settled orders).${f.open ? ` ${f.open} orders still in transit, counted at this rate.` : ""}`,
            [["1 bottle", "b1"], ["2 bottles", "b2"], ["3+ bottles", "b3"]].map(([a, k]) => ({ a, b: `${door(fPrev, k as "b1")} → ${door(f, k as "b1")}`, bad: false })),
            "the order size whose rate fell, and the dates of the dip (carriers, holidays).") };
          case "volume": return { ...x, grey: false, shown: 0, rate: `${tnd0(pPrev.M)} → ${tnd0(p.M)}`, detail: L(
            `Fewer or more orders carrying the same fixed costs (${tnd0(mb.base.fixedCostsTnd)} TND / month).`,
            [{ a: "Meta purchases", b: `${tnd0(pPrev.M)} → ${tnd0(p.M)}`, bad: p.M < pPrev.M }, { a: "Delivered orders", b: `${tnd0(delivered(pPrev))} → ${tnd0(dEst)}`, bad: dEst < delivered(pPrev) },
              { a: "Fixed cost per delivered order", b: `${(pPrev.F / (delivered(pPrev) || 1)).toFixed(2)} → ${(p.F / (dEst || 1)).toFixed(2)} TND`, bad: false }],
            "more profitable concepts in parallel. Volume is a production question, not a single-ad question.") };
          case "ads": return { ...x, grey: false, shown: 0, rate: `$${pPrev.cpa.toFixed(2)} → $${p.cpa.toFixed(2)}`, detail: L(
            "Cost per Meta purchase.",
            [{ a: "CPA", b: `$${pPrev.cpa.toFixed(2)} → $${p.cpa.toFixed(2)}`, bad: p.cpa > pPrev.cpa }, { a: "Spend", b: `$${tnd0(metaPrev.spendUsd)} → $${tnd0(meta.spendUsd)}`, bad: false },
              ...(pPrev.X !== p.X ? [{ a: "Exchange rate", b: `${pPrev.X} → ${p.X}`, bad: p.X > pPrev.X }] : [])],
            "Live ads: fading and over-line concepts.") };
          case "aov": return { ...x, grey: false, shown: 0, rate: `${(fPrev.delivered ? fPrev.bottles / fPrev.delivered : 0).toFixed(2)} → ${bpo.toFixed(2)} bottles`, detail: L(
            "Order value net of bottle cost, one stage (split, it shows a fake leak and a fake gain).",
            [{ a: "Order value, delivered", b: `${fPrev.delivered ? (fPrev.revenue / fPrev.delivered).toFixed(2) : "—"} → ${aov.toFixed(2)} TND`, bad: false },
              { a: "Bottles per order", b: `${(fPrev.delivered ? fPrev.bottles / fPrev.delivered : 0).toFixed(3)} → ${bpo.toFixed(3)}`, bad: false }],
            "bigger bundles earn more than they cost: the 2–3 bottle offers on the confirmation call.") };
          default: return { ...x, grey: false, shown: 0, rate: `${tnd0(pPrev.F)} → ${tnd0(p.F)}`, detail: null };
        }
      });
      const ordered = [...rows, ...(small ? [] : [greyRow])].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
      leaks = small ? [...ordered, greyRow] : ordered;
      // Shown figures add up to the shown total: the rounding goes into the last (grey) row.
      for (const l of leaks) l.shown = Math.round(l.amount);
      const drift = Math.round(lf.total) - leaks.reduce((n, l) => n + l.shown, 0);
      leaks[leaks.length - 1].shown += drift;
    }
    closed = {
      label: monthName(closedYm), prevLabel: monthName(prevYm), profit, prevProfit, zone: lineZone(cpa, mb.base.businessLineUsd), cpa, line: mb.base.businessLineUsd,
      metaOrders: meta.purchases, dmOrders: f.dmLeads, gross, grossPrev: pPrev ? delivered(pPrev) * (fPrev.delivered ? fPrev.revenue / fPrev.delivered : 0) : null,
      delivered: dEst, open: f.open + f.pending, provisional, aov, waterfall, leaks, leakTotal, leakWhy,
      tracking: f.webLeads ? meta.purchases / f.webLeads : null, lineStatus: mb.status,
      fixed: mb.base.fixedCostsTnd, estimatedDelivered: Math.max(0, dEst - f.delivered), noMeta: meta.purchases === 0,
    };
  }

  // This week = the last full week (Mon–Sun): Meta numbers final, delivery still settling → estimate.
  const mondays = weekStarts(now, 13);
  const sunday = (mon: string) => new Date(Date.parse(`${mon}T12:00:00Z`) + 6 * 864e5).toISOString().slice(0, 10);
  const wk = mondays[12], wkPrev = mondays[11];
  const metaW = metaFor(metaDays, wk, sunday(wk));
  const metaWp = metaFor(metaDays, wkPrev, sunday(wkPrev));
  const inWeek = (o: ShipperOrder, mon: string) => { const d = tunisDay(Date.parse(o.orderedAt)); return d >= mon && d <= sunday(mon); };
  const dmW = hasShipper ? orders.filter((o) => o.channel === "dm" && inWeek(o, wk)).length : null;
  const soFar = hasShipper ? orders.filter((o) => o.status === "delivered" && o.settledAt && monthOf(o.settledAt) === thisMonth).reduce((n, o) => n + o.totalTnd, 0) : null;
  const dayOfMonth = Number(tunisDay(now).slice(8, 10));
  const fmt = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const week: WeekView = {
    label: `${fmt(wk)}–${wk.slice(5, 7) === sunday(wk).slice(5, 7) ? Number(sunday(wk).slice(8, 10)) : fmt(sunday(wk))}`,
    profit: estimateProfit(metaW, m), prevProfit: estimateProfit(metaWp, m), zone: lineZone(metaW.purchases ? metaW.spendUsd / metaW.purchases : null, m.businessLineUsd),
    cpa: metaW.purchases ? metaW.spendUsd / metaW.purchases : null, metaOrders: metaW.purchases, dmOrders: dmW,
    grossSoFar: soFar, pace: soFar === null || dayOfMonth <= 1 ? null : (soFar / Math.max(1, dayOfMonth - 1)) * daysIn(thisMonth),
    monthLabel: monthName(thisMonth), closedLabel: monthName(closedYm),
  };

  // Trend: the 12 full weeks before this one. Settled weeks (3+ weeks old, with Shipper): the model on that week's orders; else the estimate.
  const trend: TrendPoint[] = mondays.slice(1).map((mon) => {
    const to = sunday(mon);
    const meta = metaFor(metaDays, mon, to);
    const b = baseFor(bases, mon.slice(0, 7)).base;
    const settling = !hasShipper || Date.parse(`${to}T12:00:00Z`) > now - 21 * 864e5;
    if (settling) return { monday: mon, profit: estimateProfit(meta, b), settling: true };
    const f = funnel(orders.filter((o) => inWeek(o, mon)), b);
    const fixedWeek = (b.fixedCostsTnd / daysIn(mon.slice(0, 7))) * 7;
    const pw = params(f, meta, b, fixedWeek);
    return { monday: mon, profit: profitFromLeads(f, pw, meta.spendUsd), settling: false };
  });

  return { closed, week, trend, hasShipper };
}

/** Stock days left = bottles at Shipper ÷ bottles shipped per day (last 14 days). */
export function stockDays(bottles: number | null, orders: ShipperOrder[], now: number): { days: number | null; perDay: number } {
  const from = now - 14 * 864e5;
  const shipped = orders.filter((o) => o.shippedAt && Date.parse(o.shippedAt) >= from).reduce((n, o) => n + o.bottles, 0);
  const perDay = shipped / 14;
  return { days: bottles === null || !perDay ? null : Math.floor(bottles / perDay), perDay };
}

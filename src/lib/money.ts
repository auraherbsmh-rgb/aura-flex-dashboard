/**
 * Money rules from File 3 §1–§2, fed by one month's money settings.
 * Pure functions only, so the known-answer tests can run without a database.
 */

export type MoneyInputs = {
  businessLineUsd: number;
  aovBandLowUsd: number;
  aovBandHighUsd: number;
  exchangeRate: number;
  killTableUsd: number[]; // index 0 = 0 sales … index 9 = 9 sales
  bottleCostTnd: number;
  deliveryCostTnd: number;
  fixedPerOrderTnd: number;
  bridgeFactor: number;
  doorRate1b: number;
  doorRate2b: number;
  doorRate3b: number;
  doorRateAvg: number;
  price1bTnd: number;
  price2bTnd: number;
  price3bTnd: number;
};

/** Bottles per order from the order value, on the price ladder 59 = 1, 90 = 2, 129 = 3 (File 3 §2 step 3). */
export function bottlesFromOrderValue(orderValueTnd: number, m: MoneyInputs): number {
  if (orderValueTnd <= m.price1bTnd) return 1;
  if (orderValueTnd >= m.price3bTnd) return 3;
  if (orderValueTnd <= m.price2bTnd) return 1 + (orderValueTnd - m.price1bTnd) / (m.price2bTnd - m.price1bTnd);
  return 2 + (orderValueTnd - m.price2bTnd) / (m.price3bTnd - m.price2bTnd);
}

/** Door delivery rate for b bottles: 1 → 2 → 3+ interpolated (File 3 §2). */
export function doorRate(b: number, m: MoneyInputs): number {
  if (b <= 1) return m.doorRate1b;
  if (b >= 3) return m.doorRate3b;
  if (b <= 2) return m.doorRate1b + (b - 1) * (m.doorRate2b - m.doorRate1b);
  return m.doorRate2b + (b - 2) * (m.doorRate3b - m.doorRate2b);
}

/** An ad's own CPA line in USD from its order value in USD (File 3 §2 step 3), not rounded. */
export function ownLineExact(orderValueUsd: number, m: MoneyInputs): number {
  const ovTnd = orderValueUsd * m.exchangeRate;
  const b = bottlesFromOrderValue(ovTnd, m);
  const deliveredPerMetaPurchase = (m.bridgeFactor * doorRate(b, m)) / m.doorRateAvg;
  const leftPerOrder = ovTnd - b * m.bottleCostTnd - m.deliveryCostTnd - m.fixedPerOrderTnd;
  return (leftPerOrder * deliveredPerMetaPurchase) / m.exchangeRate;
}

/**
 * The line an ad is judged against: the business line while its order value sits inside the AOV band,
 * otherwise its own line (File 3 §2 steps 2–3). Rounded to the cent.
 */
export function lineForOrderValue(orderValueUsd: number, m: MoneyInputs): number {
  if (orderValueUsd >= m.aovBandLowUsd && orderValueUsd <= m.aovBandHighUsd) return m.businessLineUsd;
  return Math.round(ownLineExact(orderValueUsd, m) * 100) / 100;
}

/** Own line for an order of exactly 1, 2 or 3 bottles (shown in Settings). */
export function ownLineForBottles(bottles: 1 | 2 | 3, m: MoneyInputs): number {
  const price = bottles === 1 ? m.price1bTnd : bottles === 2 ? m.price2bTnd : m.price3bTnd;
  return Math.round(ownLineExact(price / m.exchangeRate, m) * 100) / 100;
}

/** Kill table (File 3 §1, Door B): below 10 sales, kill once spend reaches the amount for that many sales. */
export function killSpendFor(sales: number, m: MoneyInputs): number | null {
  if (sales < 0 || sales > 9) return null; // from 10 sales on, judge CPA vs own line instead
  return m.killTableUsd[sales] ?? null;
}

export function isAtKillLine(sales: number, spendUsd: number, m: MoneyInputs): boolean {
  const limit = killSpendFor(sales, m);
  return limit !== null && spendUsd >= limit;
}

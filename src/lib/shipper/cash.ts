// Cash at Shipper (founder, Oct 19): the balance rebuilt from Shipper's "transferred" totals minus what left it.
// Pure functions (tested in tests/shipper.test.ts).

/** The baseline row covers everything taken out up to this day; fixed charges after it are counted here. */
export const CASH_BASE_DAY = "2026-10-19";
/** Shipper's fixed charges, from its transaction export: logistics subscription on the 1st, tax stamp on the 8th. */
export const MONTHLY_CHARGES = [{ day: 1, tnd: 19, label: "subscription" }, { day: 8, tnd: 1, label: "tax stamp" }] as const;

/** Fixed charges strictly after `from` up to and including `to` (YYYY-MM-DD, Tunisia days). */
export function fixedCharges(from: string, to: string): number {
  let total = 0;
  const [fy, fm] = from.split("-").map(Number);
  for (let y = fy, m = fm; `${y}-${String(m).padStart(2, "0")}-01` <= to; m === 12 ? (y++, m = 1) : m++) {
    for (const c of MONTHLY_CHARGES) {
      const d = `${y}-${String(m).padStart(2, "0")}-${String(c.day).padStart(2, "0")}`;
      if (d > from && d <= to) total += c.tnd;
    }
  }
  return total;
}

/** Balance = transferred − taken out − fixed charges since the baseline day. */
export function shipperBalance(transferred: number, takenOut: number, today: string): number {
  return Math.round((transferred - takenOut - fixedCharges(CASH_BASE_DAY, today)) * 1000) / 1000;
}

/** Reads a typed number the way people write it: "$4.18", "17,813", " 0.749 ", "4 scripts / week". Empty → null. */
export function parseNumber(raw: FormDataEntryValue | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (s === "" || s === "—" || s === "-") return null;
  const m = s.replace(/[$,\s]/g, "").match(/^-?\d+(\.\d+)?/);
  if (!m) return NaN;
  return Number(m[0]);
}

/** A rate typed as 69.1 or 0.691 or "69.1%" → 0.691. */
export function parseRate(raw: FormDataEntryValue | null | undefined): number | null {
  const n = parseNumber(raw);
  if (n === null || Number.isNaN(n)) return n;
  return n > 1 ? n / 100 : n;
}

export function text(raw: FormDataEntryValue | null | undefined): string {
  return raw === null || raw === undefined ? "" : String(raw).trim();
}

/** Name codes go into ad names split on "_": letters and digits, words joined by "-". */
export function toNameCode(label: string): string {
  return label
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[’']/g, "")
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join("-");
}

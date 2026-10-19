/** Reads a typed number the way people write it: "$4.18", "17,813", " 0.749 ", "4 scripts / week". Empty → null. */
export function parseNumber(raw: FormDataEntryValue | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  // Arabic-Indic (٠-٩) and Eastern Arabic (۰-۹) digits become 0-9; a decimal comma "4,5" becomes "4.5".
  const s = String(raw)
    .trim()
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/^(\d+),(\d{1,2})$/, "$1.$2");
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

/**
 * Concept tag for ad names (decision Oct 15): the face's first name, or one word for the idea when nobody is
 * in the video. One word, Latin letters or digits, no dashes: "Sami", "talking objects" → "TalkingObjects", "Hédi" → "Hedi", "3d".
 */
export function toConceptTag(name: string): string {
  // One word of Latin letters and digits, like the database rule ("3d" allowed, decision Oct 16).
  return toNameCode(name).replace(/-/g, "").slice(0, 30);
}

/**
 * A TND amount as founders type it: "7060", "7 060", "7,060" (thousands) → 7060; "7060,5" or "7060.500" → decimals.
 * A comma followed by exactly 3 digits is read as thousands (withdrawals are large); the pop-up shows what it understood.
 */
export function parseTnd(raw: string): number | null {
  let s = raw.trim().replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[\u06f0-\u06f9]/g, (d) => String(d.charCodeAt(0) - 0x06f0)).replace(/[\s\u00a0\u202f]/g, "").replace(/(TND|DT|د\.ت)$/i, "");
  if (s === "") return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/,/g, "");
  else if (/^\d{1,3}(,\d{3})+$/.test(s)) s = s.replace(/,/g, "");
  else s = s.replace(",", ".");
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

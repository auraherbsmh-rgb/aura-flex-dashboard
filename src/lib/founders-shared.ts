export type FounderNames = { f1: string; f2: string };
export const DEFAULT_FOUNDERS: FounderNames = { f1: "Founder 1", f2: "Founder 2" };

/** Replaces the role words "Founder 1" / "Founder 2" (any case) in a text with the founders' names. */
export function withFounderNames(text: string, n: FounderNames): string {
  return text.replace(/founder ([12])/gi, (m, d: string) => {
    const name = d === "1" ? n.f1 : n.f2;
    return m === m.toUpperCase() && m !== m.toLowerCase() ? name.toUpperCase() : name;
  });
}

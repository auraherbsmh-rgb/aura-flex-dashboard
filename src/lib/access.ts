/** Who sees which tab (handoff §3). Pure data: no database access here, so it can be tested on its own. */

export type Role = "founder_1" | "founder_2" | "copywriter" | "editor";

export type TabKey = "home" | "business" | "copywriting" | "editing" | "map" | "settings";

export const TABS: { key: TabKey; label: string; href: string }[] = [
  { key: "home", label: "Home", href: "/home" },
  { key: "business", label: "Business", href: "/business" },
  { key: "copywriting", label: "Copywriting", href: "/copywriting" },
  { key: "editing", label: "Editing", href: "/editing" },
  { key: "map", label: "Map & performance", href: "/map" },
  { key: "settings", label: "Settings", href: "/settings" },
];

const ALL: TabKey[] = TABS.map((t) => t.key);

export const TABS_BY_ROLE: Record<Role, TabKey[]> = {
  founder_1: ALL,
  founder_2: ALL,
  copywriter: ["copywriting"],
  editor: ["editing"],
};

/** First screen after login: founders land on Home, the team on their only tab. */
export const LANDING_BY_ROLE: Record<Role, string> = {
  founder_1: "/home",
  founder_2: "/home",
  copywriter: "/copywriting",
  editor: "/editing",
};

/** Subtitle under the name in the header, as on the artboards. */
export const ROLE_SUBTITLE: Record<Role, string> = {
  founder_1: "Copywriting review",
  founder_2: "Editing · launch · testimonials",
  copywriter: "Copywriter",
  editor: "Editor",
};

export function isLoginRole(role: string): role is Role {
  return role === "founder_1" || role === "founder_2" || role === "copywriter" || role === "editor";
}

export function canSee(role: Role, tab: TabKey): boolean {
  return TABS_BY_ROLE[role].includes(tab);
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  // "Founder 1" → "F1", "Copywriter 2" → "C2", "Amel Ben Ali" → "AB"
  return parts
    .slice(0, 2)
    .map((p) => (/^\d+$/.test(p) ? p : p[0]?.toUpperCase() ?? ""))
    .join("");
}

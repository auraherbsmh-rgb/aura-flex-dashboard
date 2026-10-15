/** Proposal types and helpers safe for both server and browser code. */

export const AWARENESS = ["Problem-Aware", "Solution-Aware", "Product-Aware", "Most-Aware"] as const;
export type Awareness = (typeof AWARENESS)[number];

/** "Problem-Aware" → "Problem", as cells are written on the artboards ("CGD × Problem"). */
export const shortAwareness = (a: string) => a.replace("-Aware", "");

export type PickItem = { id: string; code: string | null; label: string };
export type Pickers = { avatars: PickItem[]; angles: PickItem[]; formats: PickItem[] };

export type Proposal = {
  id: string;
  status: "waiting" | "approved" | "on_hold" | "rejected";
  createdAt: string;
  decidedAt: string | null;
  proposedById: string;
  proposedBy: string;
  avatarCode: string;
  awareness: string;
  angle: string;          // existing angle name, or the proposed new angle name
  isNewAngle: boolean;
  why: string;
  format: string | null;
  answer: string | null;
  decidedBy: string | null;
};

/** Short ages as on the Home artboards: "6h", "1 DAY", "3 DAYS". */
export function ageLabel(fromIso: string, now = Date.now()): { hours: number; text: string } {
  const hours = Math.max(0, (now - Date.parse(fromIso)) / 36e5);
  if (hours < 24) return { hours, text: `${Math.floor(hours)}h` };
  const days = Math.floor(hours / 24);
  return { hours, text: `${days} DAY${days > 1 ? "S" : ""}` };
}

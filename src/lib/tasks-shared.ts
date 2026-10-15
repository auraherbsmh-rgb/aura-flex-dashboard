/** Task types and pure helpers, safe for server and browser code. */

export type TaskLite = {
  id: string;
  avatarId: string;
  awareness: string;
  angleId: string;
  formatId: string;
  status: string;
};

export type ChangeFacts = { used: { label: string; count: number }[]; total: number; untried: string[] };

/**
 * CHANGE box, facts only (handoff §7): what has been tried in this cell and angle so far, and what hasn't.
 * Counts concepts by format for now; hook types join once Script details exist (screen 6).
 */
export function changeFacts(
  tasks: TaskLite[],
  cell: { avatarId: string; awareness: string; angleId: string },
  formats: { id: string; label: string }[],
): ChangeFacts {
  const here = tasks.filter(
    (t) => t.status !== "cancelled" && t.avatarId === cell.avatarId && t.awareness === cell.awareness && t.angleId === cell.angleId,
  );
  const counts = new Map<string, number>();
  for (const t of here) counts.set(t.formatId, (counts.get(t.formatId) ?? 0) + 1);
  const used = formats.filter((f) => counts.has(f.id)).map((f) => ({ label: f.label, count: counts.get(f.id) as number }));
  const untried = formats.filter((f) => !counts.has(f.id)).map((f) => f.label);
  return { used, total: here.length, untried };
}

export type CopywriterLoad = { id: string; name: string; target: number | null; approvedThisWeek: number; openTasks: number };

/** ★ = the copywriter with the most room this week: fewest open tasks, then fewest scripts approved. */
export function suggestCopywriter(list: CopywriterLoad[]): string | null {
  if (!list.length) return null;
  return [...list].sort((a, b) => a.openTasks - b.openTasks || a.approvedThisWeek - b.approvedThisWeek)[0].id;
}

/** Monday 00:00 (Tunisia time is UTC+1 all year) of the week containing `now`, as an ISO string. */
export function weekStartIso(now = new Date()): string {
  const tn = new Date(now.getTime() + 60 * 60 * 1000);
  const day = (tn.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = Date.UTC(tn.getUTCFullYear(), tn.getUTCMonth(), tn.getUTCDate() - day) - 60 * 60 * 1000;
  return new Date(monday).toISOString();
}

export type AngleInfo = { id: string; code: string; label: string; coreMessage: string | null };
export type CreateTaskContext = { angles: AngleInfo[]; tasks: TaskLite[]; copywriters: CopywriterLoad[] };

/** Tunisia date (UTC+1) `days` from now, as YYYY-MM-DD (default due date in Create task). */
export function tunisDate(days = 0, now = Date.now()): string {
  return new Date(now + 36e5 + days * 864e5).toISOString().slice(0, 10);
}

export const TASK_STATUS: Record<string, { word: string; tone: string }> = {
  writing: { word: "WRITING", tone: "t-blue" },
  review: { word: "IN REVIEW", tone: "t-violet" },
  changes: { word: "NEEDS CHANGES", tone: "t-red" },
  approved: { word: "APPROVED", tone: "t-green" },
  details_done: { word: "DETAILS DONE", tone: "t-green" },
};

export type TaskRow = {
  id: string;
  status: string;
  dueOn: string;
  createdAt: string;
  copywriter: string;
  copywriterId: string;
  avatarCode: string;
  awareness: string;
  angle: string;
  format: string;
  keep: string | null;
  note: string | null;
  reference: string | null;
};

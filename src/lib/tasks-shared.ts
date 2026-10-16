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

export type Round = {
  round: number;
  scriptUrl: string;
  submittedAt: string;
  submittedBy: string;
  decision: "approved" | "changes" | null;
  loom: string | null;
  note: string | null;
  decidedBy: string | null;
  decidedAt: string | null;
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
  angleId: string;
  angle: string;
  angleCode: string;
  format: string;
  formatCode: string;
  keep: string | null;
  note: string | null;
  reference: string | null;
  scriptUrl: string | null;
  origin: string;
  changeFacts: ChangeFacts | null;
  rounds: Round[]; // oldest first
};

export const OPEN_STATUSES = ["writing", "changes", "review"];

/** Progress steps of the task view (handoff §7). Index of the step the task is on now. */
export const STEPS = ["WRITE", "REVIEW", "APPROVED", "SHOOT", "EDIT", "LIVE", "RESULT"] as const;
export function stepNow(status: string): number {
  // approved = script approved, details still to fill; details_done = handed to production (shoot or generate next)
  if (status === "review") return 1;
  if (status === "approved") return 2;
  if (status === "details_done") return 3;
  return 0; // writing, changes
}

export type InboxLine = { tag: string; tone: string; title: string; sub: string; rank: number };

/** One inbox line per task: what it needs now, most urgent first (rank). */
export function inboxLine(t: TaskRow, forFounder: boolean, now = Date.now()): InboxLine {
  const today = tunisDate(0, now);
  const tomorrow = tunisDate(1, now);
  const cell = `${t.avatarCode} × ${t.awareness.replace("-Aware", "")} · ${t.angle}`;
  const who = forFounder ? ` · ${t.copywriter}` : "";
  const last = t.rounds[t.rounds.length - 1];
  const due = `due ${fmtDay(t.dueOn)}`;
  const writing = t.status === "writing" || t.status === "changes";
  if (t.status === "changes") {
    const what = last?.note ?? (last?.loom ? "watch the founder Loom" : "see the founder note");
    // For founders the rework is the copywriter's job: it sorts below scripts waiting on them.
    return { tag: "NEEDS CHANGES", tone: "t-red", title: cell, sub: `Round ${last?.round ?? 1}: ${what}${who}`, rank: forFounder ? 1 : 0 };
  }
  if (writing && t.dueOn < today) return { tag: "LATE", tone: "t-red", title: cell, sub: `${t.format} · was ${due}${who}`, rank: 1 };
  if (writing && t.dueOn === today) return { tag: "DUE TODAY", tone: "t-amber", title: cell, sub: `${t.format}${who}`, rank: 2 };
  if (writing && t.dueOn === tomorrow) return { tag: "DUE TOMORROW", tone: "t-amber", title: cell, sub: `${t.format}${who}`, rank: 2 };
  if (t.status === "writing" && !t.rounds.length) return { tag: "NEW TASK", tone: "t-blue", title: cell, sub: `${t.format} · ${due}${who}`, rank: 3 };
  if (t.status === "writing") return { tag: "WRITING", tone: "t-grey", title: cell, sub: `${t.format} · ${due}${who}`, rank: 3 };
  if (t.status === "review") {
    return { tag: forFounder ? "REVIEW" : "IN REVIEW", tone: "t-blue", title: cell, sub: `Round ${last?.round ?? 1} · ${forFounder ? "waiting on you" : "waiting on Founder 1"}${who}`, rank: forFounder ? 0 : 4 };
  }
  // Approved: the copywriter still has to fill the Script details, so it sits near the top of her inbox.
  if (t.status === "approved") return { tag: "FILL DETAILS", tone: "t-amber", title: cell, sub: `Script approved · fill the script details${who}`, rank: forFounder ? 5 : 1 };
  return { tag: "IN PRODUCTION", tone: "t-grey", title: cell, sub: `${t.format} · details done${who}`, rank: 6 };
}

export function fmtDay(iso: string) {
  const d = new Date(`${iso.slice(0, 10)}T12:00:00Z`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
}

/** Date and time in Tunisia, e.g. "Thu 15 Oct, 14:05". */
export function fmtWhen(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Africa/Tunis" });
}

/** Only http(s) links become clickable (a typed reference may be plain text). */
export const isLink = (v: string | null | undefined): v is string => !!v && /^https?:\/\/\S+$/i.test(v.trim());

export type AngleHistoryRow = { cell: string; format: string; status: string; month: string };

/** Request time, read once per render on the server and passed down (keeps client and server in step). */
export const requestTime = () => Date.now();

/** Ad set and ad names (handoff §5): Format_Avatar_Awareness_Angle_ConceptTag[_V#]. Same rule as the database. */
export function adSetName(t: Pick<TaskRow, "formatCode" | "avatarCode" | "awareness" | "angleCode">, tag: string): string {
  return `${t.formatCode}_${t.avatarCode}_${t.awareness}_${t.angleCode}_${tag || "Face"}`;
}

export type Variation = { hookTypeId: string; hookLine: string; headline: string };
export type ScriptDetails = {
  face: string;
  shootOn: string; // YYYY-MM-DD or ""
  generate: boolean;
  vo: boolean;
  mainArgumentId: string;
  offer: number | null;
  variations: Variation[];
  adSetName: string | null;
  confirmedAt: string | null;
  ads: { v: number; hookType: string; hookLine: string; headline: string | null; adName: string }[];
};
export type DetailsPickers = { hookTypes: { id: string; label: string }[]; mainArguments: { id: string; label: string }[]; prices: [number | null, number | null, number | null] };

/** What still blocks "Confirm details" (same checks as the database), in plain words. */
export function missingDetails(d: Pick<ScriptDetails, "face" | "shootOn" | "generate" | "vo" | "mainArgumentId" | "variations">, tag: string, minVars = 5): string[] {
  const miss: string[] = [];
  if (!tag) miss.push("face name");
  if (!d.generate && !d.vo && !d.shootOn) miss.push("shoot date (or VO / AI / 3D)");
  if (!d.mainArgumentId) miss.push("main argument");
  if (d.variations.length < minVars) miss.push(`${minVars - d.variations.length} more variation${minVars - d.variations.length > 1 ? "s" : ""}`);
  d.variations.forEach((v, i) => {
    if (!v.hookTypeId) miss.push(`V${i + 1} hook type`);
    if (v.hookLine.trim().length < 2) miss.push(`V${i + 1} hook line`);
  });
  return miss;
}

/** Production of a confirmed script (screen 8): footage, then the edit assignment. */
export type Production = {
  taskId: string;
  footageUrl: string | null;
  allHooksShot: boolean | null;
  footageGap: string | null;
  footageAt: string | null;
  editorId: string | null;
  editorName: string | null;
  editDue: string | null;
  brief: string | null;
  reference: string | null;
  assignedAt: string | null;
  editStartedAt: string | null;
  finalUrl: string | null;
  launchedAt: string | null;
  liveAt: string | null;
  liveSource: "manual" | "meta" | null;
  /** On hold (founders): late alerts and Home items stop, the editor can't send versions. */
  holdAt?: string | null;
  holdReason?: string | null;
  /** VO scripts: optional inspiration link for the editor. */
  inspirationUrl?: string | null;
};
/** What the Launch pop-up shows: the ad set name and one ad name per hook, ready to copy. */
export type LaunchNames = { adSetName: string | null; ads: { v: number; name: string }[] };
export type EditorLoad = { id: string; name: string; doesAi: boolean; queue: number };
/** What the Footage received and Assign pop-ups show about the script. */
export type ProdCard = {
  taskId: string;
  face: string;
  cell: string;
  angle: string;
  format: string;
  copywriter: string;
  shootOn: string | null;
  generate: boolean;
  /** VO (no shoot): Founder 2 uploads the voice recording instead of raw footage. */
  vo: boolean;
  hooks: number;
  confirmedAt: string | null;
};
export type ProdStage = "shoot" | "assign" | "editing";
/** Where a confirmed script stands: waiting for footage (shoot), ready to assign, or with an editor. */
/** On hold and not launched yet: late alerts and Home items pause, the editor can't send versions. */
export const isHeld = (p: Production | undefined | null) => !!p?.holdAt && !p.launchedAt;

export function prodStage(generate: boolean, p: Production | undefined): ProdStage {
  if (p?.assignedAt) return "editing";
  if (generate || p?.footageAt) return "assign";
  return "shoot";
}
/** ★ editor: full AI / 3D goes to the AI editor (Editor A); otherwise the shortest queue. */
export function suggestEditor(list: EditorLoad[], generate: boolean): string | null {
  if (!list.length) return null;
  if (generate) {
    const ai = list.filter((e) => e.doesAi).sort((a, b) => a.queue - b.queue)[0];
    if (ai) return ai.id;
  }
  return [...list].sort((a, b) => a.queue - b.queue)[0].id;
}

/** Fewest ad variations to confirm: AI / 3D videos need 1 (decision Oct 16), filmed videos 5. Max 6 for all. */
export const minVariations = (formatCode: string) => (formatCode === "AI" ? 1 : 5);

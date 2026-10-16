import { test } from "node:test";
import assert from "node:assert/strict";
import { changeFacts, suggestCopywriter, tunisDate, weekStartIso } from "../src/lib/tasks-shared";

const formats = [{ id: "u", label: "UGC" }, { id: "d", label: "Doctor video" }, { id: "v", label: "VSL" }];
const cell = { avatarId: "a", awareness: "Problem-Aware", angleId: "g" };

test("CHANGE box counts only this cell and angle, never cancelled tasks", () => {
  const f = changeFacts(
    [
      { id: "1", ...cell, formatId: "u", status: "approved" },
      { id: "2", ...cell, formatId: "u", status: "writing" },
      { id: "3", ...cell, formatId: "d", status: "cancelled" },
      { id: "4", ...cell, awareness: "Most-Aware", formatId: "v", status: "writing" },
    ],
    cell,
    formats,
  );
  assert.deepEqual(f.used, [{ label: "UGC", count: 2 }]);
  assert.equal(f.total, 2);
  assert.deepEqual(f.untried, ["Doctor video", "VSL"]);
});

test("★ goes to the copywriter with the most room", () => {
  assert.equal(suggestCopywriter([]), null);
  assert.equal(
    suggestCopywriter([
      { id: "x", name: "X", target: 4, approvedThisWeek: 1, openTasks: 2 },
      { id: "y", name: "Y", target: 4, approvedThisWeek: 3, openTasks: 1 },
    ]),
    "y",
  );
});

test("Tunisia dates (UTC+1)", () => {
  const lateNight = Date.parse("2026-10-15T23:30:00Z"); // 00:30 on Oct 16 in Tunis
  assert.equal(tunisDate(0, lateNight), "2026-10-16");
  assert.equal(tunisDate(7, lateNight), "2026-10-23");
  // Sunday 23:30 UTC is already Monday in Tunis → that Monday starts the week.
  assert.equal(weekStartIso(new Date("2026-10-18T23:30:00Z")), "2026-10-18T23:00:00.000Z");
  assert.equal(weekStartIso(new Date("2026-10-15T10:00:00Z")), "2026-10-11T23:00:00.000Z");
});

import { inboxLine, stepNow, type TaskRow } from "../src/lib/tasks-shared";

const t0: TaskRow = {
  id: "t", status: "writing", dueOn: "2026-10-20", createdAt: "", copywriter: "C1", copywriterId: "c1", avatarCode: "FSB", awareness: "Problem-Aware",
  angleId: "g", angle: "Knee-Broad", angleCode: "Knee-Broad", format: "UGC", formatCode: "UGC", keep: null, note: null, reference: null, scriptUrl: null, origin: "manual", changeFacts: null, rounds: [],
};
const NOW = Date.parse("2026-10-15T10:00:00Z");

test("inbox lines: changes first, late, due soon, new, review", () => {
  const r = { round: 1, scriptUrl: "https://x.y", submittedAt: "", submittedBy: "C1", decision: "changes" as const, loom: null, note: "Faster hook", decidedBy: "F1", decidedAt: "" };
  assert.equal(inboxLine({ ...t0, status: "changes", rounds: [r] }, false, NOW).tag, "NEEDS CHANGES");
  assert.match(inboxLine({ ...t0, status: "changes", rounds: [r] }, false, NOW).sub, /Faster hook/);
  assert.equal(inboxLine({ ...t0, dueOn: "2026-10-14" }, false, NOW).tag, "LATE");
  assert.equal(inboxLine({ ...t0, dueOn: "2026-10-16" }, false, NOW).tag, "DUE TOMORROW");
  assert.equal(inboxLine(t0, false, NOW).tag, "NEW TASK");
  assert.equal(inboxLine({ ...t0, status: "review", rounds: [{ ...r, decision: null }] }, false, NOW).tag, "IN REVIEW");
  assert.equal(inboxLine({ ...t0, status: "review", rounds: [{ ...r, decision: null }] }, true, NOW).tag, "REVIEW");
  // A review never shows as late for the copywriter: the script is sent.
  assert.equal(inboxLine({ ...t0, status: "review", dueOn: "2026-10-01", rounds: [{ ...r, decision: null }] }, false, NOW).tag, "IN REVIEW");
});

test("progress step", () => {
  assert.equal(stepNow("writing"), 0);
  assert.equal(stepNow("changes"), 0);
  assert.equal(stepNow("review"), 1);
  assert.equal(stepNow("approved"), 2);
});

import { adSetName, missingDetails } from "../src/lib/tasks-shared";
import { toConceptTag } from "../src/lib/parse";

test("concept tag and ad names (decision Oct 15)", () => {
  assert.equal(toConceptTag("Sami"), "Sami");
  assert.equal(toConceptTag("hédi"), "Hedi");
  assert.equal(toConceptTag("talking objects"), "TalkingObjects");
  assert.equal(toConceptTag("سامي"), "");
  assert.equal(toConceptTag("3D"), "3D"); // digits allowed (decision Oct 16)
  assert.equal(adSetName({ formatCode: "AUTH", avatarCode: "CGD", awareness: "Problem-Aware", angleCode: "Knee-Broad" }, "Ali"), "AUTH_CGD_Problem-Aware_Knee-Broad_Ali");
});

test("Script details: what blocks Confirm", () => {
  const v = { hookTypeId: "h", hookLine: "Hello there", headline: "" };
  const ok = { face: "Sami", shootOn: "2026-10-20", generate: false, vo: false, mainArgumentId: "m", variations: [v, v, v, v, v] };
  assert.deepEqual(missingDetails(ok, "Sami"), []);
  assert.deepEqual(missingDetails({ ...ok, shootOn: "", generate: true }, "Sami"), []);
  assert.deepEqual(missingDetails({ ...ok, shootOn: "" }, "Sami"), ["shoot date (or VO / AI / 3D)"]);
  assert.deepEqual(missingDetails({ ...ok, shootOn: "", vo: true }, "Sami"), [], "VO needs no shoot date");
  assert.deepEqual(missingDetails({ ...ok, variations: [v, { ...v, hookTypeId: "" }] }, ""), ["face name", "3 more variations", "V2 hook type"]);
});

import { buildPipeline } from "../src/lib/pipeline-shared";

test("Scripts pipeline: steps, late rules, handed to production", () => {
  const now = Date.parse("2026-10-16T10:00:00Z");
  const base = { ...t0, createdAt: "2026-10-14T10:00:00Z" };
  const sent = { round: 1, scriptUrl: "https://x.y", submittedAt: "2026-10-13T08:00:00Z", submittedBy: "C1", decision: null, loom: null, note: null, decidedBy: null, decidedAt: null };
  const tasks = [
    { ...base, id: "w", status: "writing", dueOn: "2026-10-20" },
    { ...base, id: "wl", status: "writing", dueOn: "2026-10-14" },
    { ...base, id: "r", status: "review", rounds: [sent] }, // 74h in review → late
    { ...base, id: "a", status: "approved", rounds: [{ ...sent, decision: "approved" as const, decidedAt: "2026-10-16T08:00:00Z" }] },
    { ...base, id: "d", status: "details_done" },
  ];
  const p = buildPipeline(tasks, [{ taskId: "d", face: "Sami", shootOn: "2026-10-17", generate: false, confirmedAt: "2026-10-15T09:00:00Z" }], {
    forFounder: true, reviewHours: 48, detailsDays: 1, weekStart: "2026-10-11T23:00:00.000Z", now,
  });
  const by = new Map(p.rows.map((r) => [r.id, r]));
  assert.equal(p.rows.length, 4);
  assert.deepEqual(by.get("w")!.steps, ["now", "todo", "todo", "todo", "todo"]);
  assert.equal(by.get("wl")!.late, true);
  assert.equal(by.get("wl")!.due, "late 2 d");
  assert.deepEqual(by.get("r")!.steps, ["done", "late", "todo", "todo", "todo"]);
  assert.equal(by.get("r")!.waitingOn, "You");
  assert.deepEqual(by.get("a")!.steps, ["done", "done", "skip", "done", "now"]);
  assert.equal(by.get("a")!.nowLabel, "2 h");
  assert.ok(p.rows[0].late && p.rows[1].late, "late first");
  assert.deepEqual(p.handed.map((h) => h.label), ["SAMI · SHOOT SAT"]);
  assert.equal(p.handed[0].tone, "t-grey");
});

test("Scripts pipeline: round 2, approved after changes, late changes", () => {
  const now = Date.parse("2026-10-16T10:00:00Z");
  const base = { ...t0, createdAt: "2026-10-10T10:00:00Z" };
  const ch = { round: 1, scriptUrl: "https://x.y", submittedAt: "2026-10-12T08:00:00Z", submittedBy: "C1", decision: "changes" as const, loom: null, note: "Faster", decidedBy: "F1", decidedAt: "2026-10-12T10:00:00Z" };
  const r2 = { ...ch, round: 2, submittedAt: "2026-10-16T06:00:00Z", decision: null, note: null, decidedBy: null, decidedAt: null };
  const tasks = [
    { ...base, id: "r2", status: "review", rounds: [ch, r2] },
    { ...base, id: "ac", status: "approved", rounds: [ch, { ...r2, decision: "approved" as const, decidedAt: "2026-10-16T08:00:00Z" }] },
    { ...base, id: "cl", status: "changes", dueOn: "2026-10-13", rounds: [ch] },
  ];
  const p = buildPipeline(tasks, [], { forFounder: true, reviewHours: 48, detailsDays: 1, weekStart: "2026-10-11T23:00:00.000Z", now });
  const by = new Map(p.rows.map((r) => [r.id, r]));
  assert.deepEqual(by.get("r2")!.steps, ["done", "now", "done", "todo", "todo"]);
  assert.equal(by.get("r2")!.waitingWhat, "script review · round 2");
  assert.deepEqual(by.get("ac")!.steps, ["done", "done", "done", "done", "now"]);
  assert.deepEqual(by.get("cl")!.steps, ["done", "done", "late", "todo", "todo"]);
  assert.equal(by.get("cl")!.due, "late 3 d");
  assert.equal(by.get("cl")!.waitingWhat, "your note");
});

import { prodStage, suggestEditor } from "../src/lib/tasks-shared";

test("production stage and ★ editor", () => {
  const p = { taskId: "t", footageUrl: null, allHooksShot: null, footageGap: null, footageAt: null, editorId: null, editorName: null, editDue: null, brief: null, reference: null, assignedAt: null, editStartedAt: null, finalUrl: null, launchedAt: null, liveAt: null, liveSource: null };
  assert.equal(prodStage(false, undefined), "shoot");
  assert.equal(prodStage(true, undefined), "assign");
  assert.equal(prodStage(false, { ...p, footageAt: "2026-10-16T08:00:00Z" }), "assign");
  assert.equal(prodStage(false, { ...p, footageAt: "x", assignedAt: "y" }), "editing");
  const eds = [{ id: "a", name: "Editor A", doesAi: true, queue: 4 }, { id: "b", name: "Editor B", doesAi: false, queue: 2 }];
  assert.equal(suggestEditor(eds, false), "b");
  assert.equal(suggestEditor(eds, true), "a");
  assert.equal(suggestEditor([], false), null);
});

import { mergeNeeds, type NeedGroup } from "../src/lib/needs";

test("Home All: both founders' items, covering shown once as its own type", () => {
  const it = (key: string, type: "REVIEW" | "ASSIGN" | "COVERING", hours: number) => ({ key, type, tagTone: "blue" as const, title: key, sub: "s", age: "", ageTone: "red" as const, hours });
  const f1: NeedGroup[] = [{ name: "LATE / OVER 48H", tone: "red", items: [it("r1", "REVIEW", 50), it("a1", "COVERING", 60)] }];
  const f2: NeedGroup[] = [{ name: "LATE / OVER 48H", tone: "red", items: [it("a1", "ASSIGN", 60), it("r1", "COVERING", 50)] }, { name: "NEW", tone: "grey", items: [it("a2", "ASSIGN", 2)] }];
  const all = mergeNeeds(f1, f2);
  const flat = all.flatMap((g) => g.items.map((i) => `${g.name}:${i.key}:${i.type}:${i.sub}`));
  assert.deepEqual(flat, ["LATE / OVER 48H:a1:ASSIGN:Founder 2 · s", "LATE / OVER 48H:r1:REVIEW:Founder 1 · s", "NEW:a2:ASSIGN:Founder 2 · s"]);
});

import { buildQueue, editState, editorStats } from "../src/lib/editing-shared";

test("Editing: state, queue order and alerts, private tiles", () => {
  const now = Date.parse("2026-10-16T10:00:00Z");
  const P = (taskId: string, extra: object = {}) => ({ taskId, footageUrl: "https://d.x", allHooksShot: true, footageGap: null, footageAt: "2026-10-12T08:00:00Z", editorId: "eb", editorName: "Editor B", editDue: "2026-10-20", brief: "b", reference: null, assignedAt: "2026-10-12T09:00:00Z", editStartedAt: null, finalUrl: null, launchedAt: null, liveAt: null, liveSource: null, ...extra });
  const R = (round: number, decision: "approved" | "changes" | null, extra: object = {}) => ({ round, videoUrl: "https://v.x", submittedAt: "2026-10-14T08:00:00Z", decision, loom: null, note: decision === "changes" ? "Cut faster" : null, decidedBy: "F2", decidedAt: decision ? "2026-10-15T08:00:00Z" : null, ...extra });
  assert.equal(editState(undefined, []), null);
  assert.equal(editState(P("a"), []), "ready");
  assert.equal(editState(P("a", { editStartedAt: "x" }), []), "editing");
  assert.equal(editState(P("a"), [R(1, null)]), "submitted");
  assert.equal(editState(P("a"), [R(1, "changes")]), "changes");
  assert.equal(editState(P("a"), [R(1, "changes"), R(2, "approved")]), "approved");

  const tasks = ["rd", "ch", "sb", "ok"].map((id) => ({ ...t0, id, status: "details_done" }));
  const prods = new Map([["rd", P("rd")], ["ch", P("ch", { editStartedAt: "x" })], ["sb", P("sb")], ["ok", P("ok")]]);
  const rounds = new Map([["ch", [R(1, "changes"), R(2, "changes")]], ["sb", [R(1, null)]], ["ok", [R(1, "approved")]]]);
  const cards = new Map(["rd", "ch", "sb", "ok"].map((id) => [id, { face: id, cell: "FSB × Problem", angle: "Knee-Broad", format: "UGC", generate: false }]));
  const q = buildQueue(tasks, prods, rounds, cards, { now, notStartedDays: 2, roundAlert: 3 });
  assert.deepEqual(q.map((x) => x.state), ["changes", "ready", "submitted", "approved"]);
  assert.equal(q[0].tag, "NEEDS CHANGES · ROUND 3");
  assert.equal(q[0].alert, "Round 3");
  assert.match(q[1].alert ?? "", /Footage ready 4 days, not started/);
  assert.equal(q[3].dim, true);

  const s = editorStats("eb", prods, rounds, cards, { perVideo: 100, rate3d: null }, now);
  assert.equal(s.approvedMonth, 1);
  assert.equal(s.onTime, 1);
  assert.equal(s.onTimeOf, 1);
  assert.equal(s.avgRounds, 1);
});

import { buildVideoPipeline } from "../src/lib/editing-shared";

test("Videos pipeline: one row per video, steps, late rules, AI skips shoot", () => {
  const now = Date.parse("2026-10-16T10:00:00Z");
  const base = { taskId: "", footageUrl: null, allHooksShot: null, footageGap: null, footageAt: null, editorId: null, editorName: null, editDue: null, brief: null, reference: null, assignedAt: null, editStartedAt: null, finalUrl: null, launchedAt: null, liveAt: null, liveSource: null };
  const T = (id: string, extra: object = {}) => ({ ...t0, id, status: "details_done", ...extra });
  const tasks = [T("shoot"), T("foot"), T("assign"), T("edit"), T("rev"), T("launch"), T("ai", { formatCode: "AI" }), T("done")];
  const D = (shootOn: string | null, generate = false) => ({ shootOn, generate, face: "F", confirmedAt: "2026-10-14T08:00:00Z" });
  const details = new Map([
    ["shoot", D("2026-10-20")], ["foot", D("2026-10-13")], ["assign", D("2026-10-12")], ["edit", D("2026-10-10")],
    ["rev", D("2026-10-10")], ["launch", D("2026-10-10")], ["ai", D(null, true)], ["done", D("2026-10-01")],
  ]);
  const prods = new Map([
    ["assign", { ...base, taskId: "assign", footageAt: "2026-10-15T08:00:00Z" }],
    ["edit", { ...base, taskId: "edit", footageAt: "2026-10-11T08:00:00Z", assignedAt: "2026-10-11T09:00:00Z", editorId: "e", editorName: "Editor B", editDue: "2026-10-15", editStartedAt: "2026-10-12T08:00:00Z" }],
    ["rev", { ...base, taskId: "rev", footageAt: "x", assignedAt: "2026-10-11T09:00:00Z", editorId: "e" }],
    ["launch", { ...base, taskId: "launch", footageAt: "x", assignedAt: "2026-10-11T09:00:00Z", editorId: "e" }],
    ["done", { ...base, taskId: "done", footageAt: "x", assignedAt: "y", editorId: "e", launchedAt: "2026-10-15T08:00:00Z" }],
  ]);
  const R = (decision: "approved" | null, at: string) => ({ round: 1, videoUrl: "https://v.x", submittedAt: at, decision, loom: null, note: null, decidedBy: null, decidedAt: decision ? at : null });
  const rounds = new Map([["rev", [R(null, "2026-10-13T08:00:00Z")]], ["launch", [R("approved", "2026-10-15T20:00:00Z")]]]);
  const rows = buildVideoPipeline(tasks, prods, rounds, details, { now, footageLateDays: 2, assignLateDays: 2, reviewHours: 48, launchLateDays: 2, roundAlert: 3 });
  const by = new Map(rows.map((r) => [r.taskId, r]));
  assert.equal(rows.length, 7, "launched video leaves the pipeline");
  assert.deepEqual(by.get("shoot")!.steps, ["now", "todo", "todo", "todo", "todo"]);
  assert.equal(by.get("shoot")!.nowLabel, "in 4 d");
  assert.deepEqual(by.get("foot")!.steps, ["done", "late", "todo", "todo", "todo"]);
  assert.equal(by.get("assign")!.waitingWhat, "assign");
  assert.deepEqual(by.get("edit")!.steps, ["done", "done", "late", "todo", "todo"]);
  assert.equal(by.get("edit")!.due, "1 d late");
  assert.deepEqual(by.get("rev")!.steps, ["done", "done", "done", "late", "todo"]);
  assert.deepEqual(by.get("launch")!.steps, ["done", "done", "done", "done", "now"]);
  assert.deepEqual(by.get("ai")!.steps, ["skip", "skip", "late", "todo", "todo"]); // confirmed 2 days ago, not assigned
  assert.ok(rows.slice(0, 3).every((r) => r.late), "late first");
});

test("On hold: no alerts, sorted last, ON HOLD tag; pipeline rows open Footage / Assign", () => {
  const now = Date.parse("2026-10-16T10:00:00Z");
  const base = { taskId: "", footageUrl: null, allHooksShot: null, footageGap: null, footageAt: null, editorId: null, editorName: null, editDue: null, brief: null, reference: null, assignedAt: null, editStartedAt: null, finalUrl: null, launchedAt: null, liveAt: null, liveSource: null };
  const T = (id: string) => ({ ...t0, id, status: "details_done" });
  const D = (shootOn: string | null) => ({ shootOn, generate: false, face: "F", confirmedAt: "2026-10-01T08:00:00Z" });
  const tasks = [T("held"), T("late"), T("foot")];
  const details = new Map([["held", D("2026-10-05")], ["late", D("2026-10-05")], ["foot", D("2026-10-05")]]);
  const ed = { footageAt: "2026-10-06T08:00:00Z", assignedAt: "2026-10-06T09:00:00Z", editorId: "e", editorName: "Editor B", editDue: "2026-10-10" };
  const prods = new Map([
    ["held", { ...base, ...ed, taskId: "held", holdAt: "2026-10-14T08:00:00Z", holdReason: "Knee script first" }],
    ["late", { ...base, ...ed, taskId: "late" }],
  ]);
  const rows = buildVideoPipeline(tasks, prods, new Map(), details, { now, footageLateDays: 2, assignLateDays: 2, reviewHours: 48, launchLateDays: 2, roundAlert: 3 });
  assert.equal(rows[rows.length - 1].taskId, "held", "on hold sorts last");
  const held = rows.find((r) => r.taskId === "held")!;
  assert.equal(held.late, false);
  assert.equal(held.due, "on hold");
  assert.equal(held.hold?.reason, "Knee script first");
  assert.equal(held.action, null, "with an editor: opens the video");
  assert.equal(rows.find((r) => r.taskId === "foot")!.action, "footage");

  const cards = new Map(["held", "late"].map((id) => [id, { face: id, cell: "c", angle: "a", format: "UGC", generate: false }]));
  const q = buildQueue(tasks, prods, new Map(), cards, { now, notStartedDays: 2, roundAlert: 3 });
  assert.deepEqual(q.map((x) => x.taskId), ["late", "held"]);
  assert.equal(q[1].tag, "ON HOLD");
  assert.equal(q[1].alert, null);
  assert.match(q[1].sub, /Knee script first/);
  assert.ok(q[0].alert, "the other one still alerts");
});

test("VO: no shoot, waiting on the VO recording, then assign", () => {
  const now = Date.parse("2026-10-16T10:00:00Z");
  const base = { taskId: "", footageUrl: null, allHooksShot: null, footageGap: null, footageAt: null, editorId: null, editorName: null, editDue: null, brief: null, reference: null, assignedAt: null, editStartedAt: null, finalUrl: null, launchedAt: null, liveAt: null, liveSource: null };
  const T = (id: string) => ({ ...t0, id, status: "details_done" });
  const D = (confirmedAt: string) => ({ shootOn: null, generate: false, vo: true, face: "F", confirmedAt });
  const details = new Map([["fresh", D("2026-10-15T10:00:00Z")], ["old", D("2026-10-12T10:00:00Z")], ["in", D("2026-10-12T10:00:00Z")]]);
  const prods = new Map([["in", { ...base, taskId: "in", footageUrl: "https://d.x", footageAt: "2026-10-16T08:00:00Z" }]]);
  const rows = buildVideoPipeline([T("fresh"), T("old"), T("in")], prods, new Map(), details, { now, footageLateDays: 2, assignLateDays: 2, reviewHours: 48, launchLateDays: 2, roundAlert: 3 });
  const by = new Map(rows.map((r) => [r.taskId, r]));
  assert.deepEqual(by.get("fresh")!.steps, ["skip", "now", "todo", "todo", "todo"]);
  assert.equal(by.get("fresh")!.waitingWhat, "VO recording");
  assert.equal(by.get("fresh")!.waitingOn, "You");
  assert.equal(by.get("fresh")!.action, "footage");
  assert.equal(by.get("old")!.late, true);
  assert.deepEqual(by.get("in")!.steps, ["skip", "done", "now", "todo", "todo"]);
  assert.equal(by.get("in")!.action, "assign");
});

import { buildNeeds } from "../src/lib/needs";

test("Testimonial: TESTIMONIAL item for Founder 2, covering for Founder 1 after 48h; pipeline skips shoot", () => {
  const now = Date.parse("2026-10-16T10:00:00Z");
  const tm = (id: string, addedAt: string) => ({ id, url: "https://d.x", note: "repeat buyer", addedAt });
  const prod = { cards: new Map(), productions: new Map(), footageLateDays: 2, assignLateDays: 2, testimonials: [tm("new", "2026-10-16T08:00:00Z"), tm("old", "2026-10-13T08:00:00Z")] };
  const v = (role: "founder_1" | "founder_2") => ({ personId: "p", name: "F", role, email: "" });
  const f2 = buildNeeds(v("founder_2"), [], 48, now, [], 48, prod).flatMap((g) => g.items);
  assert.deepEqual(f2.map((i) => i.type).sort(), ["TESTIMONIAL", "TESTIMONIAL"]);
  const f1 = buildNeeds(v("founder_1"), [], 48, now, [], 48, prod).flatMap((g) => g.items);
  assert.deepEqual(f1.map((i) => `${i.type}:${i.testimonial?.id}`), ["COVERING:old"]);

  const base = { taskId: "ts", footageUrl: "https://d.x", allHooksShot: true, footageGap: null, footageAt: "2026-10-16T08:00:00Z", editorId: null, editorName: null, editDue: null, brief: "b", reference: null, assignedAt: null, editStartedAt: null, finalUrl: null, launchedAt: null, liveAt: null, liveSource: null };
  const rows = buildVideoPipeline([{ ...t0, id: "ts", status: "details_done", origin: "testimonial", copywriter: "Testimonial" }], new Map([["ts", base]]), new Map(),
    new Map([["ts", { shootOn: null, generate: false, vo: false, face: "Khadija", confirmedAt: "2026-10-16T08:00:00Z" }]]),
    { now, footageLateDays: 2, assignLateDays: 2, reviewHours: 48, launchLateDays: 2, roundAlert: 3 });
  assert.deepEqual(rows[0].steps, ["skip", "done", "now", "todo", "todo"]);
  assert.equal(rows[0].action, "assign");
  assert.match(rows[0].origin, /testimonial/);
});

test("Editing queue: approved to launch, then launched, then live, then on hold", () => {
  const now = Date.parse("2026-10-16T10:00:00Z");
  const P = (taskId: string, extra: object = {}) => ({ taskId, footageUrl: "https://d.x", allHooksShot: true, footageGap: null, footageAt: "2026-10-12T08:00:00Z", editorId: "eb", editorName: "Editor B", editDue: "2026-10-20", brief: "b", reference: null, assignedAt: "2026-10-12T09:00:00Z", editStartedAt: "x", finalUrl: null, launchedAt: null, liveAt: null, liveSource: null, ...extra });
  const ok = [{ round: 1, videoUrl: "https://v.x", submittedAt: "2026-10-14T08:00:00Z", decision: "approved" as const, loom: null, note: null, decidedBy: "F2", decidedAt: "2026-10-15T08:00:00Z" }];
  const ids = ["live", "launched", "toLaunch", "held"];
  const tasks = ids.map((id) => ({ ...t0, id, status: "details_done" }));
  const prods = new Map([
    ["live", P("live", { launchedAt: "2026-10-15T09:00:00Z", liveAt: "2026-10-15T10:00:00Z" })],
    ["launched", P("launched", { launchedAt: "2026-10-15T09:00:00Z" })],
    ["toLaunch", P("toLaunch")],
    ["held", P("held", { holdAt: "2026-10-15T09:00:00Z" })],
  ]);
  const rounds = new Map(["live", "launched", "toLaunch"].map((id) => [id, ok]));
  const cards = new Map(ids.map((id) => [id, { face: id, cell: "c", angle: "a", format: "UGC", generate: false }]));
  const q = buildQueue(tasks, prods, rounds, cards, { now, notStartedDays: 2, roundAlert: 3 });
  assert.deepEqual(q.map((x) => x.taskId), ["toLaunch", "launched", "live", "held"]);
});

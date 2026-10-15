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
  angleId: "g", angle: "Knee-Broad", angleCode: "Knee-Broad", format: "UGC", formatCode: "UGC", keep: null, note: null, reference: null, scriptUrl: null, changeFacts: null, rounds: [],
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
  assert.equal(adSetName({ formatCode: "AUTH", avatarCode: "CGD", awareness: "Problem-Aware", angleCode: "Knee-Broad" }, "Ali"), "AUTH_CGD_Problem-Aware_Knee-Broad_Ali");
});

test("Script details: what blocks Confirm", () => {
  const v = { hookTypeId: "h", hookLine: "Hello there", headline: "" };
  const ok = { face: "Sami", shootOn: "2026-10-20", generate: false, mainArgumentId: "m", variations: [v, v, v, v, v] };
  assert.deepEqual(missingDetails(ok, "Sami"), []);
  assert.deepEqual(missingDetails({ ...ok, shootOn: "", generate: true }, "Sami"), []);
  assert.deepEqual(missingDetails({ ...ok, shootOn: "" }, "Sami"), ["shoot date (or AI / 3D)"]);
  assert.deepEqual(missingDetails({ ...ok, variations: [v, { ...v, hookTypeId: "" }] }, ""), ["face name", "3 more variations", "V2 hook type"]);
});

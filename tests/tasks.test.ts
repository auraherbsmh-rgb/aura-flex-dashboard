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

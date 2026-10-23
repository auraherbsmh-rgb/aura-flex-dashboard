import { test } from "node:test";
import assert from "node:assert/strict";
import { carried, itemStage, planTags, planWeek, type PlanItemRow } from "../src/lib/plan-shared";
import type { Production, TaskRow } from "../src/lib/tasks-shared";
import type { EditRound } from "../src/lib/editing-shared";

test("planWeek: Monday in Tunisia time", () => {
  assert.equal(planWeek(Date.parse("2026-10-26T08:00:00Z")), "2026-10-26"); // Monday
  assert.equal(planWeek(Date.parse("2026-11-01T22:59:00Z")), "2026-10-26"); // Sunday 23:59 Tunis
  assert.equal(planWeek(Date.parse("2026-11-01T23:00:00Z")), "2026-11-02"); // Monday 00:00 Tunis
});

const task = (id: string, status: string) => ({ id, status }) as TaskRow;
const item = (o: Partial<PlanItemRow>): PlanItemRow => ({
  id: "i", weekStart: "2026-10-19", kind: "double_down", sourceTask: "w", avatarId: null, awareness: null, note: null, taskId: null,
  addedAfterLock: false, droppedAt: null, droppedBy: null, dropReason: null, createdAt: "2026-10-19T09:00:00Z", ...o,
});

test("itemStage follows the real statuses", () => {
  const tasks = new Map([["a", task("a", "review")], ["b", task("b", "details_done")], ["c", task("c", "cancelled")], ["v", task("v", "details_done")]]);
  const prods = new Map<string, Production>([["b", { editorId: "e" } as Production], ["v", { launchedAt: "2026-10-20T10:00:00Z" } as Production]]);
  const rounds = new Map<string, EditRound[]>([["b", [{ decision: null } as EditRound]]]);
  assert.equal(itemStage(item({}), tasks, prods, rounds).word, "Task not created");
  assert.equal(itemStage(item({ taskId: "a" }), tasks, prods, rounds).word, "Script review");
  assert.equal(itemStage(item({ taskId: "b" }), tasks, prods, rounds).word, "Edit review");
  assert.equal(itemStage(item({ taskId: "c" }), tasks, prods, rounds).closed, true);
  assert.equal(itemStage(item({ kind: "launch", sourceTask: "v" }), tasks, prods, rounds).word, "Launched");
});

test("carry-over and pipeline tags", () => {
  const items = [
    item({ id: "1", taskId: "a" }), // last week, still open → carried
    item({ id: "2", taskId: "b", droppedAt: "2026-10-21T10:00:00Z" }), // dropped → not carried
    item({ id: "3", kind: "launch", sourceTask: "v" }), // launched → closed
    item({ id: "4", weekStart: "2026-10-26", taskId: "d" }), // this week
  ];
  const stage = (i: PlanItemRow) => ({ key: "writing" as never, word: "", tone: "t-blue" as const, closed: i.id === "3" });
  assert.deepEqual(carried(items, "2026-10-26", stage).map((i) => i.id), ["1"]);
  assert.deepEqual(planTags(items, "2026-10-26", stage), { a: "carry", d: "week" });
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseNumber, parseRate, toNameCode } from "../src/lib/parse";

test("numbers typed the way people write them", () => {
  assert.equal(parseNumber("$4.18"), 4.18);
  assert.equal(parseNumber("17,813"), 17813);
  assert.equal(parseNumber(" 38.50 "), 38.5);
  assert.equal(parseNumber("4 scripts / week"), 4);
  assert.equal(parseNumber(""), null);
  assert.ok(Number.isNaN(parseNumber("abc") as number));
  assert.equal(parseNumber("١٠"), 10);
  assert.equal(parseNumber("4,5"), 4.5);
  assert.equal(parseNumber("17,813"), 17813);
});

test("rates typed as % or as a share", () => {
  assert.equal(parseRate("69.1"), 0.691);
  assert.equal(parseRate("0.691"), 0.691);
  assert.equal(parseRate("82.6%"), 0.826);
});

test("angle names become ad-name codes with dashes, never spaces (decision Oct 15)", () => {
  assert.equal(toNameCode("Surgery fear"), "Surgery-Fear");
  assert.equal(toNameCode("Can’t carry my grandson"), "Cant-Carry-My-Grandson");
  assert.equal(toNameCode("Knee-Surgery-Fear"), "Knee-Surgery-Fear");
  assert.equal(toNameCode("  weight _ crushing  "), "Weight-Crushing");
});

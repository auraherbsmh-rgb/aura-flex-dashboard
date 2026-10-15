import { test } from "node:test";
import assert from "node:assert/strict";
import { TABS_BY_ROLE, LANDING_BY_ROLE, canSee, initials, isLoginRole } from "../src/lib/access";

test("founders see every tab, including Settings (handoff §3)", () => {
  for (const r of ["founder_1", "founder_2"] as const) {
    assert.deepEqual(TABS_BY_ROLE[r], ["home", "business", "copywriting", "editing", "map", "settings"]);
  }
});

test("copywriters see only Copywriting; editors only Editing", () => {
  assert.deepEqual(TABS_BY_ROLE.copywriter, ["copywriting"]);
  assert.deepEqual(TABS_BY_ROLE.editor, ["editing"]);
  assert.equal(canSee("copywriter", "settings"), false);
  assert.equal(canSee("editor", "business"), false);
  assert.equal(canSee("copywriter", "editing"), false);
});

test("landing tab per role", () => {
  assert.equal(LANDING_BY_ROLE.founder_1, "/home");
  assert.equal(LANDING_BY_ROLE.copywriter, "/copywriting");
  assert.equal(LANDING_BY_ROLE.editor, "/editing");
});

test("agency and strategist cannot log in", () => {
  assert.equal(isLoginRole("agency"), false);
  assert.equal(isLoginRole("strategist"), false);
  assert.equal(isLoginRole("editor"), true);
});

test("initials match the artboards", () => {
  assert.equal(initials("Founder 1"), "F1");
  assert.equal(initials("Founder 2"), "F2");
  assert.equal(initials("Amel Ben Ali"), "AB");
});

import { SHOW_TAB_BAR, ROLE_SUBTITLE, brandSubtitle } from "../src/lib/access";

test("header per role matches the artboards", () => {
  assert.equal(SHOW_TAB_BAR.copywriter, false);
  assert.equal(SHOW_TAB_BAR.editor, true);
  assert.equal(ROLE_SUBTITLE.editor, "Video editor");
  assert.equal(brandSubtitle("copywriting"), "Copywriting");
  assert.equal(brandSubtitle("home"), "Team dashboard");
});

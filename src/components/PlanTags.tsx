"use client";

import type { PlanTag } from "@/lib/plan-shared";

/** Monday plan tag on a pipeline row: THIS WEEK (blue) or FROM LAST WEEK (orange, not finished last week). */
export function PlanTagChip({ tag }: { tag?: PlanTag }) {
  if (!tag) return null;
  return tag === "carry"
    ? <span className="tag t-orange wk-tag"><i aria-hidden="true" />FROM LAST WEEK</span>
    : <span className="tag t-blue wk-tag"><i aria-hidden="true" />THIS WEEK</span>;
}

/** "This week's plan / All" switch above a pipeline. */
export function PlanFilter({ on, set, count }: { on: boolean; set: (v: boolean) => void; count: number }) {
  return (
    <div className="recess wseg" role="group" aria-label="Week plan filter">
      <button type="button" className={on ? "seg-on" : ""} aria-pressed={on} onClick={() => set(true)}>This week&apos;s plan · {count}</button>
      <button type="button" className={!on ? "seg-on" : ""} aria-pressed={!on} onClick={() => set(false)}>All</button>
    </div>
  );
}

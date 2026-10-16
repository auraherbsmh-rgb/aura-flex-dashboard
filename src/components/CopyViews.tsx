"use client";

import { useState } from "react";

const VIEWS = [
  { key: "board", label: "Board" },
  { key: "pipeline", label: "Pipeline" },
  { key: "library", label: "Library" },
] as const;
export type CopyView = (typeof VIEWS)[number]["key"];

/**
 * Board · Pipeline · Library switch (Copywriting tab, handoff §7). All three views are already on the page,
 * so switching is instant; the address keeps the choice for a reload.
 */
export function CopyViews({ initial, board, pipeline, library }: { initial: CopyView; board: React.ReactNode; pipeline: React.ReactNode; library: React.ReactNode }) {
  const [view, setView] = useState<CopyView>(initial);
  const pick = (v: CopyView) => {
    setView(v);
    const q = new URLSearchParams(window.location.search);
    if (v === "board") q.delete("view"); else q.set("view", v);
    window.history.replaceState(window.history.state, "", `/copywriting${q.size ? `?${q}` : ""}`);
  };
  return (
    <>
      <div className="recess wseg" role="group" aria-label="View" style={{ alignSelf: "flex-start" }}>
        {VIEWS.map((v) => (
          <button key={v.key} type="button" className={view === v.key ? "seg-on" : ""} aria-pressed={view === v.key} onClick={() => pick(v.key)}>{v.label}</button>
        ))}
      </div>
      <div hidden={view !== "board"}>{board}</div>
      <div hidden={view !== "pipeline"}>{pipeline}</div>
      <div hidden={view !== "library"}>{library}</div>
    </>
  );
}

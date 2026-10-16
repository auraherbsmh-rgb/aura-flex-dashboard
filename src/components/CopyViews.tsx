"use client";

import { useSearchParams } from "next/navigation";

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
export function CopyViews({ board, pipeline, library }: { board: React.ReactNode; pipeline: React.ReactNode; library: React.ReactNode }) {
  // The view lives in the address (?view=…): links to a task (no view) always land on the Board.
  const params = useSearchParams();
  const raw = params.get("view");
  const view: CopyView = raw === "pipeline" || raw === "library" ? raw : "board";
  const pick = (v: CopyView) => {
    const q = new URLSearchParams(window.location.search);
    if (v === "board") q.delete("view"); else q.set("view", v);
    window.history.replaceState(null, "", `/copywriting${q.size ? `?${q}` : ""}`);
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

"use client";

import { useSearchParams } from "next/navigation";

const VIEWS = [
  { key: "board", label: "Board" },
  { key: "pipeline", label: "Pipeline" },
  { key: "library", label: "Library" },
] as const;
export type CopyView = (typeof VIEWS)[number]["key"] | "score";

/**
 * Board · Pipeline · Library switch (Copywriting tab, handoff §7) + the Scorecard: "My scorecard" for a copywriter;
 * founders get "Scorecard · <name>" once they pick that copywriter (not part of their Board · Pipeline · Library switch).
 * Every view is already on the page, so switching is instant; the address keeps the choice for a reload.
 */
export function CopyViews({ board, pipeline, library, scorecards = {}, selfId = null, writerNames = {} }: {
  board: React.ReactNode; pipeline: React.ReactNode; library: React.ReactNode;
  scorecards?: Record<string, React.ReactNode>; selfId?: string | null; writerNames?: Record<string, string>;
}) {
  // The view lives in the address (?view=…): links to a task (no view) always land on the Board.
  const params = useSearchParams();
  const raw = params.get("view");
  const cw = params.get("cw");
  const scoreId = selfId ?? (cw && scorecards[cw] ? cw : null);
  const view: CopyView = raw === "pipeline" || raw === "library" ? raw : raw === "score" && scoreId ? "score" : "board";
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
        {scoreId && (
          <button type="button" className={view === "score" ? "seg-on" : ""} aria-pressed={view === "score"} onClick={() => pick("score")}>
            {selfId ? "My scorecard" : `Scorecard · ${writerNames[scoreId] ?? "copywriter"}`}
          </button>
        )}
      </div>
      <div hidden={view !== "board"}>{board}</div>
      <div hidden={view !== "pipeline"}>{pipeline}</div>
      <div hidden={view !== "library"}>{library}</div>
      {view === "score" && scoreId && <div>{scorecards[scoreId]}</div>}
    </>
  );
}

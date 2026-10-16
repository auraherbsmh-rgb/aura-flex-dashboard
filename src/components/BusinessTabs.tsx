"use client";

import { useSearchParams } from "next/navigation";

/** Business: Money | Creative engine (handoff §10). Both views are on the page; the address keeps the choice. */
export function BusinessTabs({ money, engine }: { money: React.ReactNode; engine: React.ReactNode }) {
  const params = useSearchParams();
  const view = params.get("view") === "engine" ? "engine" : "money";
  const pick = (v: "money" | "engine") => {
    const q = new URLSearchParams(window.location.search);
    if (v === "money") q.delete("view"); else q.set("view", v);
    window.history.replaceState(null, "", `/business${q.size ? `?${q}` : ""}`);
  };
  return (
    <>
      <div className="recess wseg" role="group" aria-label="View" style={{ alignSelf: "flex-start" }}>
        <button type="button" className={view === "money" ? "seg-on" : ""} aria-pressed={view === "money"} onClick={() => pick("money")}>Money</button>
        <button type="button" className={view === "engine" ? "seg-on" : ""} aria-pressed={view === "engine"} onClick={() => pick("engine")}>Creative engine</button>
      </div>
      <div hidden={view !== "money"}>{money}</div>
      <div hidden={view !== "engine"}>{engine}</div>
    </>
  );
}

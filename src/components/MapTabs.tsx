"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { MapPage, type MapData } from "./Map";
import { LiveAds } from "./LiveAds";
import { TagOldAd } from "./OldAd";
import type { LiveConcept, Unmapped } from "@/lib/live-shared";
import type { Pickers } from "@/lib/proposals-shared";
import type { CreateTaskContext } from "@/lib/tasks-shared";

export type LiveView =
  | { connected: false; missing: string[]; lastError: string | null }
  | { connected: true; live: LiveConcept[]; unmapped: Unmapped[]; frozenEntities: number; lastPull: string | null; d3Min: number };

/** Map & performance: Map | Live ads (handoff §3). The choice lives in ?view=live. */
export function MapTabs({ map, pickers, tagPickers, createCtx, live }: { map: MapData; pickers: Pickers; tagPickers: Pickers; createCtx: CreateTaskContext | null; live: LiveView }) {
  const params = useSearchParams();
  const view = params.get("view") === "live" ? "live" : "map";
  const [tag, setTag] = useState<Unmapped | null>(null);
  const [msg, setMsg] = useState("");
  const pick = (v: "map" | "live") => {
    const q = new URLSearchParams(window.location.search);
    if (v === "map") q.delete("view"); else q.set("view", v);
    window.history.replaceState(null, "", `/map${q.size ? `?${q}` : ""}`);
  };
  return (
    <>
      <div className="recess wseg" role="group" aria-label="View" style={{ alignSelf: "flex-start" }}>
        <button type="button" className={view === "map" ? "seg-on" : ""} aria-pressed={view === "map"} onClick={() => pick("map")}>Map</button>
        <button type="button" className={view === "live" ? "seg-on" : ""} aria-pressed={view === "live"} onClick={() => pick("live")}>Live ads</button>
      </div>
      {msg && <div className="notice notice-green" role="status">{msg}</div>}
      <div hidden={view !== "map"}><MapPage data={map} pickers={pickers} createCtx={createCtx} /></div>
      <div hidden={view !== "live"}>
        {live.connected ? (
          <LiveAds live={live.live} unmapped={live.unmapped} frozenEntities={live.frozenEntities} lastPull={live.lastPull} d3Min={live.d3Min} onTag={setTag} />
        ) : (
          <section className="card sec">
            <span className="tag t-amber" style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />META · NOT CONNECTED YET</span>
            <p style={{ margin: 0, fontSize: 15 }}>Live ads fills itself from the daily Meta pull. It is built and switched off until these are added in Vercel → Settings → Environment Variables:</p>
            <ul style={{ margin: 0, fontSize: 14 }}>{live.missing.map((m) => <li key={m} className="mono">{m}</li>)}</ul>
            {live.lastError && <div className="formmsg err">Last pull: {live.lastError}</div>}
            <div className="unit">Then Settings → Data → Pull now, or wait for the daily pull at 06:00. Nothing in Meta is ever changed by the dashboard.</div>
          </section>
        )}
      </div>
      {tag && <TagOldAd key={tag.base} base={tag.base} example={tag.example} guess={tag.formatGuess} pickers={tagPickers} onClose={() => setTag(null)} onDone={setMsg} />}
    </>
  );
}

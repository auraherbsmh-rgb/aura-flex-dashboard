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
  | { connected: false; missing: string[]; noCron: boolean; noMoney: boolean; lastError: string | null }
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
    setMsg("");
  };
  return (
    <>
      <div className="recess wseg" role="group" aria-label="View" style={{ alignSelf: "flex-start" }}>
        <button type="button" className={view === "map" ? "seg-on" : ""} aria-pressed={view === "map"} onClick={() => pick("map")}>Map</button>
        <button type="button" className={view === "live" ? "seg-on" : ""} aria-pressed={view === "live"} onClick={() => pick("live")}>Live ads</button>
      </div>
      <div hidden={view !== "map"}><MapPage data={map} pickers={pickers} createCtx={createCtx} /></div>
      <div hidden={view !== "live"}>
        {msg && <div className="notice notice-green" role="status" style={{ marginBottom: 16 }}>{msg}</div>}
        {live.connected ? (
          <LiveAds live={live.live} unmapped={live.unmapped} frozenEntities={live.frozenEntities} lastPull={live.lastPull} d3Min={live.d3Min} onTag={setTag} />
        ) : (
          <section className="card sec">
            <span className="tag t-amber" style={{ alignSelf: "flex-start" }}><i aria-hidden="true" />{live.missing.length ? "META · NOT CONNECTED YET" : live.noMoney ? "META · MONEY NUMBERS MISSING" : "META · WAITING FOR THE FIRST PULL"}</span>
            {live.missing.length > 0 && (
              <>
                <p style={{ margin: 0, fontSize: 15 }}>Live ads fills itself from the daily Meta pull. It is built and switched off until these are added in Vercel → Settings → Environment Variables:</p>
                <ul style={{ margin: 0, fontSize: 14 }}>{live.missing.map((m) => <li key={m} className="mono">{m}</li>)}</ul>
              </>
            )}
            {live.noMoney && <p style={{ margin: 0, fontSize: 15 }}>Live ads judges every ad against the business line and kill table: fill them in Settings → Money.</p>}
            {!live.missing.length && !live.noMoney && <p style={{ margin: 0, fontSize: 15 }}>Meta is connected; no ads pulled yet.</p>}
            {live.noCron && <p style={{ margin: 0, fontSize: 14 }}>Also add <span className="mono">CRON_SECRET</span> in Vercel for the daily 06:00 pull (Pull now works without it).</p>}
            {live.lastError && <div className="formmsg err">Last pull: {live.lastError}</div>}
            <div className="unit">{live.missing.length ? "Then " : ""}Settings → Data → Pull now, or wait for the daily pull at 06:00. Nothing in Meta is ever changed by the dashboard.</div>
          </section>
        )}
      </div>
      {tag && <TagOldAd key={tag.base} base={tag.base} example={tag.example} guess={tag.formatGuess} pickers={tagPickers} onClose={() => setTag(null)} onDone={setMsg} />}
    </>
  );
}

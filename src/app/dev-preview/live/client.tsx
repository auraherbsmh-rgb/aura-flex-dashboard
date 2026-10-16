"use client";

import { useState } from "react";
import { LiveAds } from "@/components/LiveAds";
import { TagOldAd, PauseInMeta } from "@/components/OldAd";
import type { LiveConcept, Unmapped } from "@/lib/live-shared";

const L = (id: string, label: string, code?: string) => ({ id, code: code ?? label, label });
const pickers = {
  avatars: ["FSB", "FSS", "MSB", "MSP", "CGD", "CGS", "BRD"].map((c) => L(c, c)),
  angles: [{ ...L("kb", "Knee-Broad"), track: "knee" }, { ...L("hb", "Hips-Broad"), track: "hips" }],
  formats: [L("ugc", "UGC", "UGC"), L("vsl", "VSL", "VSL"), L("img", "Image", "IMG")],
};

export function LivePreview({ live, unmapped }: { live: LiveConcept[]; unmapped: Unmapped[] }) {
  const [tag, setTag] = useState<Unmapped | null>(null);
  const [pause, setPause] = useState(false);
  return (
    <>
      <button type="button" className="btn b-ghost" onClick={() => setPause(true)} style={{ alignSelf: "flex-start" }}>Preview: Pause in Meta pop-up</button>
      <LiveAds live={live} unmapped={unmapped} frozenEntities={0} lastPull="2026-10-16 06:00 (Tunisia)" d3Min={5} onTag={setTag} />
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {tag && <TagOldAd base={tag.base} example={tag.example} guess={tag.formatGuess} pickers={pickers as any} onClose={() => setTag(null)} onDone={() => setTag(null)} />}
      {pause && <PauseInMeta adId="000000000001" name="UGC_MSB_Solution-Aware_Knee-Broad_Mervet_V1" flag="kill" reason="Kill table reached: $13 spent at 0 sales" onClose={() => setPause(false)} onDone={() => setPause(false)} />}
    </>
  );
}

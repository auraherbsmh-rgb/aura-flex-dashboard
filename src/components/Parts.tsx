import { readPart, type Bands } from "@/lib/tasks-shared";

/** Script parts (handoff §7): Opening (hook rate) · Hold · Clicks (link CTR) — signals only; the verdict is CPA vs line. */
export function Parts({ r, isStatic, bands }: {
  r: { hookRate: number | null; hold: number | null; ctr: number | null; impressions7?: number };
  isStatic: boolean;
  bands: Bands | null;
}) {
  const parts = [
    { label: "Opening", p: readPart("hook", r.hookRate, isStatic, r.impressions7, bands) },
    { label: "Hold", p: readPart("hold", r.hold, isStatic, r.impressions7, bands) },
    { label: "Clicks", p: readPart("ctr", r.ctr, isStatic, r.impressions7, bands) },
  ];
  return (
    <span className="parts">
      {parts.map(({ label, p }) => (
        <span key={label} className={`part-v ${p.tone}`}>
          <span className="unit">{label}</span> <b className="mono">{p.text}</b>
          {p.tone && <span className="sr-only">{p.tone === "pt-g" ? " (in its format band)" : " (below its format band)"}</span>}
        </span>
      ))}
    </span>
  );
}

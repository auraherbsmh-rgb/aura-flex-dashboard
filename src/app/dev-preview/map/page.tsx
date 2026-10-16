import { notFound } from "next/navigation";
import { MapPage } from "@/components/Map";
import type { MapConcept } from "@/lib/map-shared";

/** Dev preview of the map + cell view (ENABLE_PREVIEW=1 only). */
export default function Preview() {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
  const avatars = ["FSB", "FSS", "MSB", "MSP", "CGD", "CGS"].map((c) => ({ id: c, code: c, label: c }));
  const C = (id: string, av: string, aw: string, extra: Partial<MapConcept> = {}): MapConcept => ({
    taskId: id, avatarId: av, avatarCode: av, awareness: aw, angleId: "kb", angle: "Knee-Broad", angleCode: "Knee-Broad", track: "knee",
    format: "UGC", formatCode: "UGC", origin: "manual", status: "writing", copywriter: "Copywriter 1", createdAt: "2026-10-16T10:00:00Z", face: null,
    generate: false, vo: false, launchedAt: null, liveAt: null, holdAt: null, variations: [], ...extra,
  });
  const v = (n: number) => Array.from({ length: n }, (_, i) => ({ v: i + 1, type: i % 2 ? "Authority" : "Storytelling", line: `Hook line ${i + 1}`, name: `UGC_FSB_Problem-Aware_Knee-Broad_Mervet_V${i + 1}` }));
  const concepts = [
    C("1", "FSB", "Problem-Aware", { status: "details_done", face: "Mervet", launchedAt: "2026-10-16T12:00:00Z", variations: v(5) }),
    C("2", "FSB", "Problem-Aware", { status: "details_done", face: "Sami", angleId: "kp", angle: "Knee-Prayer", variations: v(5) }),
    C("3", "FSB", "Problem-Aware"),
    C("4", "CGS", "Problem-Aware", { status: "details_done", face: "Hedi", format: "Doctor video (AUTH)", variations: v(6) }),
    C("5", "MSP", "Solution-Aware"),
    C("6", "CGD", "Most-Aware", { status: "details_done", face: "Samia", origin: "testimonial", copywriter: "Testimonial", variations: v(3).map((x) => ({ ...x, type: null })) }),
  ];
  return (
    <main className="page"><div className="slab"><div className="body">
      <MapPage data={{ concepts, start: "2026-10-16", avatars }} />
    </div></div></main>
  );
}

import { notFound } from "next/navigation";
import { Library } from "@/components/Library";
import type { LibRow } from "@/lib/library-shared";

/** Dev preview of Copywriting → Library (ENABLE_PREVIEW=1 only). */
export default function Preview() {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
  const R = (id: string, name: string, extra: Partial<LibRow> = {}): LibRow => ({
    taskId: id, name, avatarCode: "FSB", awareness: "Problem-Aware", cell: "FSB × Problem", angleId: "kp", angle: "Knee-Prayer", format: "UGC", formatKey: "UGC",
    mainArgumentId: "m1", offer: 2, copywriter: "Copywriter 2", editor: "Editor B", testimonial: false, startedAt: "2026-10-10T10:00:00Z",
    approvedAt: "2026-10-12T10:00:00Z", launchedAt: null, state: "production", days: [2, 1, 1, 3, 2, 0], done: false,
    hooks: [1, 2, 3].map((v) => ({ v, type: v === 2 ? "Myth Busting" : "Storytelling", line: `I couldn't kneel to pray anymore ${v}`, headline: v === 1 ? "My knees, every Friday" : null, name: `UGC_FSB_Problem-Aware_Knee-Prayer_${name}_V${v}` })),
    looms: [{ label: "Script review · round 1 · Oct 11", url: "https://www.loom.com/share/x" }],
    links: [{ label: "Script ↗", url: "https://docs.google.com/x" }, { label: "Raw footage ↗", url: "https://drive.google.com/x" }],
    ...extra,
  });
  const rows = [
    R("1", "Mervet"),
    R("2", "Yassine", { cell: "CGS × Problem", avatarCode: "CGS", angle: "Father-Suffer", angleId: "fs", state: "testing", launchedAt: "2026-10-18T10:00:00Z", days: [3, 1, 1, 5, 2, 1], done: true }),
    R("3", "Samia", { format: "Testimonial", formatKey: "Testimonial", copywriter: "Support call", testimonial: true, days: [0, 0, 0, 0, 2, 0], state: "hold" }),
  ];
  return (
    <main className="page"><div className="slab"><div className="body">
      <Library rows={rows} avatars={["FSB", "FSS", "MSB", "MSP", "CGD", "CGS"]} angles={[{ id: "kp", label: "Knee-Prayer" }, { id: "fs", label: "Father-Suffer" }]}
        formats={["Testimonial", "UGC"]} hookTypes={["Storytelling", "Myth Busting", "Authority"]} mainArguments={[{ id: "m1", label: "Customer proof · testimonial" }]} />
    </div></div></main>
  );
}

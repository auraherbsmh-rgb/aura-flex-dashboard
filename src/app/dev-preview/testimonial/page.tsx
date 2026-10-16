import { notFound } from "next/navigation";
import { TestimonialButton } from "@/components/Testimonial";

/** Dev preview of the Testimonial tag pop-up (ENABLE_PREVIEW=1 only). Saving buttons call the real server: don't click them. */
export default function Preview() {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
  const avatars = ["FSB", "FSS", "MSB", "MSP", "CGD", "CGS"].map((c) => ({ id: c, code: c, label: c }));
  const angles = ["Knee-Broad", "Knee-Prayer", "Hips-Walking"].map((c) => ({ id: c, code: c, label: c }));
  const pickers = { avatars, angles, formats: [] };
  const editors = [{ id: "ea", name: "Editor A", doesAi: true, queue: 1 }, { id: "eb", name: "Editor B", doesAi: false, queue: 3 }];
  return (
    <main className="page">
      <div className="slab"><div className="body" style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        <TestimonialButton pickers={pickers} editors={editors} />
        <TestimonialButton pickers={pickers} editors={editors} label="Tag testimonial" className="btn b-primary" item={{ id: "t1", url: "https://drive.google.com/call", note: "repeat buyer, 2 min", addedAt: "2026-10-13T09:00:00Z" }} />
      </div></div>
    </main>
  );
}

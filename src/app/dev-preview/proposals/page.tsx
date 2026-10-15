import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { NeedsMe, ProposeButton, ProposalList } from "@/components/Proposals";
import { buildNeeds } from "@/lib/needs";
import type { Pickers, Proposal } from "@/lib/proposals-shared";

/** Local-only preview of screen 3 with sample proposals (ENABLE_PREVIEW=1; never on Vercel). */
export default function Preview() {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
  const now = Date.parse("2026-10-15T15:00:00Z");
  const h = (hours: number) => new Date(now - hours * 36e5).toISOString();
  const base = { decidedAt: null, proposedById: "c2", proposedBy: "Copywriter 2", format: null, answer: null, decidedBy: null, avatarId: "a1", angleId: "g1", formatId: null, hasTask: false };
  const proposals: Proposal[] = [
    { ...base, id: "p1", status: "waiting", createdAt: h(52), avatarCode: "CGD", awareness: "Problem-Aware", angle: "Can’t carry my grandson", isNewAngle: true, why: "Daughters tell me their mother cries because she can’t pick up the baby." },
    { ...base, id: "p2", status: "waiting", createdAt: h(26), avatarCode: "FSS", awareness: "Most-Aware", angle: "Knee-Broad", isNewAngle: false, why: "Women with a surgery date are the most ready to act.", format: "Doctor video (AUTH)" },
    { ...base, id: "p3", status: "waiting", createdAt: h(3), avatarCode: "MSB", awareness: "Solution-Aware", angle: "Knee-Weight", isNewAngle: false, why: "Men who tried painkillers first." },
    { ...base, id: "p4", status: "rejected", createdAt: h(80), avatarCode: "MSP", awareness: "Problem-Aware", angle: "Office-Chair", isNewAngle: true, why: "Desk workers.", answer: "Too close to Knee-Standing-Profession for now.", decidedBy: "Founder 1" },
  ];
  const pickers: Pickers = {
    avatars: [{ id: "a1", code: "FSB", label: "FSB · female sufferer, broad" }, { id: "a2", code: "CGD", label: "CGD · caregiver daughter" }],
    angles: [{ id: "g1", code: "Knee-Broad", label: "Knee-Broad" }, { id: "g2", code: "Knee-Prayer", label: "Knee-Prayer" }],
    formats: [{ id: "f1", code: "UGC", label: "UGC" }, { id: "f2", code: "AUTH", label: "Doctor video (AUTH)" }, { id: "f3", code: "AI", label: "AI / 3D" }],
  };
  const v1 = { personId: "f1", name: "Founder 1", role: "founder_1" as const, email: "" };
  const g1 = buildNeeds(v1, proposals, 48, now);
  const g2 = buildNeeds({ ...v1, name: "Founder 2", role: "founder_2" }, proposals, 48, now);
  return (
    <main className="page">
      <div className="slab">
        <div className="band"><AppHeader viewer={v1} active="home" /><h1 className="h1" style={{ marginTop: 28 }}>Home</h1></div>
        <div className="body">
          <NeedsMe groups={g1} total={g1.reduce((n, g) => n + g.items.length, 0)} />
          <div className="lbl">Founder 2 sees (covering after 48h):</div>
          <NeedsMe groups={g2} total={g2.reduce((n, g) => n + g.items.length, 0)} />
          <section className="card sec"><div className="sh"><h2>Proposals</h2></div><div><ProposeButton pickers={pickers} /></div><ProposalList proposals={proposals} showAuthor /></section>
        </div>
      </div>
    </main>
  );
}

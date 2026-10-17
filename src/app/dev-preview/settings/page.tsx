import { notFound } from "next/navigation";
import { AppHeader } from "@/components/AppHeader";
import { SettingsSections, SettingsSwitch, SettingsPills, type SettingsData } from "@/app/(app)/settings/SettingsView";

/**
 * Local-only preview of Settings with the real seeded values, for screenshots and the checker
 * (the build workspace cannot reach Supabase). Off unless ENABLE_PREVIEW=1; never set on Vercel.
 */
export default function Preview() {
  if (process.env.ENABLE_PREVIEW !== "1") notFound();
  const s: SettingsData = {
    mapStart: "2026-10-20",
    meta: { token: false, serviceKey: false, cronSecret: false, ready: false, last: null },
    shipper: { key: false, serviceKey: false, mapped: true, ready: false, last: null },
    money: {
      id: "x", month: "2026-09-01", status: "final", business_line_usd: 4.18, roas_line: 5.5, aov_band_low_usd: 20, aov_band_high_usd: 26,
      exchange_rate: 3.35, fixed_costs_tnd: 17813, kill_table_usd: [13, 14, 20, 28, 38.5, 44, 50, 55, 60.5, 66],
      bottle_cost_tnd: 20.6, delivery_cost_tnd: 13, fixed_per_order_tnd: 9.78, bridge_factor: 0.6279,
      door_rate_1b: 0.691, door_rate_2b: 0.826, door_rate_3b: 0.872, door_rate_avg: 0.749,
      price_1b_tnd: 59, price_2b_tnd: 90, price_3b_tnd: 129, ritual_on: "2026-10-12", next_ritual_on: "2026-11-02",
    },
    rules: [
      ["behind_pace", "copywriting", "Behind pace", 4, "scripts / week"], ["review_waiting_hours", "copywriting", "Review waiting, then covering founder", 48, "hours"],
      ["details_not_filled_days", "copywriting", "Script details not filled after approval", 1, "day"], ["proposal_unanswered_hours", "copywriting", "Proposal unanswered", 48, "hours"],
      ["same_format_or_hook", "copywriting", "Same format or hook", 4, "of last 5"], ["losses_in_a_row", "copywriting", "Losses in a row", 5, "settled"],
      ["footage_late_days", "editing", "Footage not received after shoot date", 2, "days"], ["edit_not_started_days", "editing", "Footage ready, edit not started", 2, "days"],
      ["revision_round_alert", "editing", "Revision round alert", 3, "rounds"], ["launch_waiting_days", "editing", "Ready to launch, not launched", 2, "days"],
      ["d3_colour_min_sales", "live", "3d CPA colored from", 5, "sales in 3 days"], ["stock_red_days", "live", "Stock red below", null, "days left"],
    ].map(([key, grp, label, value, unit], i) => ({ key, grp, label, value, unit, sort: i } as SettingsData["rules"][number])),
    flags: [
      { key: "email_instant", enabled: true, label: "Email: instant for new task, needs changes, ready for review" },
      { key: "email_digest", enabled: true, label: "Email: daily digest for the rest" },
    ],
    lists: [
      ...["FSB · female sufferer, broad", "FSS · female sufferer, surgery", "MSB · male sufferer, broad", "MSP · male sufferer, professional", "CGD · caregiver daughter", "CGS · caregiver son"]
        .map((label, i) => ({ id: `a${i}`, list: "avatar" as const, code: label.slice(0, 3), label, status: "approved" as const, track: null, sort: i })),
      ...["Knee-Broad", "Knee-Prayer", "Knee-Weight", "Knee-Standing-Profession", "Ingredients", "Social-Proof", "Benefits", "Maintenance", "Dream-Outcome", "Hips-Walking", "Hips-Sleep", "Hips-Broad", "Father-Suffer"]
        .map((c, i) => ({ id: `g${i}`, list: "angle" as const, code: c, label: c, status: "approved" as const, track: "knee" as const, sort: i })),
      ...["Knee-Surgery-Fear", "Offer-Urgency"].map((c, i) => ({ id: `r${i}`, list: "angle" as const, code: c, label: c, status: "reserved" as const, track: "knee" as const, sort: 20 + i })),
      ...["Educational", "Storytelling", "Myth Busting", "Authority", "Comparison", "Day in the Life", "Other"].map((label, i) => ({ id: `h${i}`, list: "hook_type" as const, code: null, label, status: "approved" as const, track: null, sort: i })),
      ...["Mechanism · triple therapy", "Ingredients", "Doctor authority", "Customer proof · testimonial", "Comparison · painkillers or surgery", "Cost of waiting", "Other"].map((label, i) => ({ id: `m${i}`, list: "main_argument" as const, code: null, label, status: "approved" as const, track: null, sort: i })),
      { id: "z1", list: "hook_type", code: null, label: "Question", status: "archived", track: null, sort: 99 },
      ...[["UGC", "UGC"], ["AUTH", "Doctor video (AUTH)"], ["VSL", "VSL"], ["AI", "AI / 3D"], ["IMG", "Static (IMG)"]].map(([code, label], i) => ({ id: `f${i}`, list: "format" as const, code, label, status: "approved" as const, track: null, sort: i })),
    ],
    campaigns: [
      { campaign_id: "120239086261480285", name: "Aura_Flex_ABO_Campaign", track: "knee", kind: "ABO", active: true },
      { campaign_id: "120243711637580285", name: "Aura_Flex_CBO_Campaign", track: "knee", kind: "CBO", active: true },
      { campaign_id: "120249171976800285", name: "Aura_Flex_Hips_ABO_Campaign", track: "hips", kind: "ABO", active: true },
      { campaign_id: "120255035251870285", name: "Aura_Flex_Hips_CBO", track: "hips", kind: "CBO", active: true },
    ],
    people: [
      { id: "p1", display_name: "Founder 1", role: "founder_1", email: "founder1@example.com", does_ai_3d: false, active: true, has_login: true, pay_amount_tnd: null, pay_unit: null, rate_3d_tnd: null, weekly_target: null },
      { id: "p4", display_name: "Shooting agency", role: "agency", email: null, does_ai_3d: false, active: true, has_login: false, pay_amount_tnd: 4000, pay_unit: "per_month", rate_3d_tnd: null, weekly_target: null },
      { id: "p5", display_name: "Creative strategist", role: "strategist", email: null, does_ai_3d: false, active: true, has_login: false, pay_amount_tnd: 1500, pay_unit: "per_month", rate_3d_tnd: null, weekly_target: null },
      { id: "p7", display_name: "Amel", role: "copywriter", email: "amel@example.com", does_ai_3d: false, active: true, has_login: false, pay_amount_tnd: null, pay_unit: null, rate_3d_tnd: null, weekly_target: 4 },
      { id: "p8", display_name: "Editor A", role: "editor", email: "editora@example.com", does_ai_3d: true, active: true, has_login: true, pay_amount_tnd: 100, pay_unit: "per_video", rate_3d_tnd: null, weekly_target: null },
      { id: "p6", display_name: "Copywriter 1 (test, removed)", role: "copywriter", email: "cw1.check@invalid.test", does_ai_3d: false, active: false, has_login: true, pay_amount_tnd: null, pay_unit: null, rate_3d_tnd: null, weekly_target: null },
    ],
    levels: [],
  };
  const today = "2026-10-15";
  return (
    <main className="page">
      <div className="slab">
        <div className="band">
          <AppHeader viewer={{ personId: "p1", name: "Founder 1", role: "founder_1", email: "" }} active="settings" roleNote="Founders only" />
          <div style={{ marginTop: 28 }}>
            <div style={{ marginBottom: 18 }}><SettingsSwitch /></div>
            <h1 className="h1">Settings</h1>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", marginTop: 12 }}><SettingsPills s={s} today={today} /></div>
          </div>
        </div>
        <div className="body"><SettingsSections s={s} today={today} /></div>
      </div>
    </main>
  );
}

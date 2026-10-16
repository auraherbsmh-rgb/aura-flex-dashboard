import { TabPage } from "@/components/TabPage";
import { NeedsMe } from "@/components/Proposals";
import { CreateTaskButton } from "@/components/Tasks";
import { FounderNumbers, HomeHero } from "@/components/Home";
import { TestimonialButton } from "@/components/Testimonial";
import { requireTab } from "@/lib/viewer";
import { getPickers, getProposals } from "@/lib/proposals";
import {
  getCreateTaskContext, getDetailsLite, getEditRounds, getEditors, getHookCounts, getLaunchNames, getProductions, getTasks, getTestimonials, prodCards, requestTime,
} from "@/lib/tasks";
import { buildNeeds, getRule, mergeNeeds } from "@/lib/needs";
import { getLiveData } from "@/lib/meta/live-data";
import { createClient } from "@/lib/supabase/server";
import { buildVideoPipeline } from "@/lib/editing-shared";
import { buildBlocked, pace, scriptsApprovedThisWeek, speedSplit, videosApprovedThisWeek, waitingToLaunch } from "@/lib/home-shared";

export const metadata = { title: "Home · Aura Flex" };

/** Tunisia (UTC+1) clock for the greeting and date block. */
function tunisClock(now: number) {
  const d = new Date(now + 36e5);
  const h = d.getUTCHours();
  return {
    greeting: h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening",
    day: String(d.getUTCDate()),
    weekday: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    month: d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" }),
  };
}

export default async function Page() {
  const viewer = await requireTab("home");
  const [proposals, hours, reviewHours, footageLateDays, assignLateDays, launchLateDays, roundAlert, videoTarget, pickers, ctx, tasks, details, productions, hooks, editRounds, launchNames, testimonials] = await Promise.all([
    getProposals(),
    getRule("proposal_unanswered_hours", 48),
    getRule("review_waiting_hours", 48),
    getRule("footage_late_days", 2),
    getRule("edit_not_started_days", 2),
    getRule("launch_waiting_days", 2),
    getRule("revision_round_alert", 3),
    getRule("videos_weekly_target", 0),
    getPickers(),
    getCreateTaskContext(),
    getTasks(),
    getDetailsLite(),
    getProductions(),
    getHookCounts(),
    getEditRounds(),
    getLaunchNames(),
    getTestimonials(),
  ]);
  const now = requestTime();
  const supabase = await createClient();
  // Live ads (daily Meta pull): KILL and UNMAPPED items. Empty until Meta is connected.
  const [editors, live, formats] = await Promise.all([
    getEditors(productions, tasks),
    getLiveData(now),
    supabase.from("list_items").select("id, code, label").eq("list", "format").eq("status", "approved").order("sort"),
  ]);
  const cards = prodCards(tasks, details, hooks);
  const tagPickers = { ...pickers, formats: (formats.data ?? []) as { id: string; code: string | null; label: string }[] };
  const prod = { cards, productions, footageLateDays, assignLateDays, editRounds, launchLateDays, launchNames, testimonials, kills: live.kills, unmapped: live.unmappedItems };
  const groups = buildNeeds(viewer, proposals, hours, now, tasks, reviewHours, prod);
  // "All": what each founder has on their own Home (so Founder 1 can see Founder 2's items, and the reverse).
  const asRole = (role: "founder_1" | "founder_2") => buildNeeds({ ...viewer, role }, proposals, hours, now, tasks, reviewHours, prod);
  const allGroups = mergeNeeds(asRole("founder_1"), asRole("founder_2"));
  const items = groups.flatMap((g) => g.items);
  const total = items.length;
  const late = groups.filter((g) => g.name.startsWith("LATE")).reduce((n, g) => n + g.items.length, 0);
  // Oldest waiting = the longest wait on the founder (OVERDUE measures the copywriter's lateness, not a wait).
  const waits = items.filter((i) => i.type !== "OVERDUE");
  const oldest = waits.length ? waits.reduce((a, b) => (b.hours > a.hours ? b : a)).age : null;

  // The three numbers. Scripts target = the copywriters' weekly targets (Settings → People);
  // videos target = Settings → Alerts → "Videos to deliver per week" (founder decision Oct 16).
  const target = ctx.copywriters.reduce((n, c) => n + (c.target ?? 0), 0) || null;
  const scriptTasks = tasks.filter((t) => t.origin !== "testimonial");
  const faces = new Map(details.map((d) => [d.taskId, d.face ?? ""]).filter(([, f]) => f) as [string, string][]);
  const videoRows = buildVideoPipeline(tasks, productions, editRounds, new Map(details.map((d) => [d.taskId, d])), { now, footageLateDays, assignLateDays, reviewHours, launchLateDays, roundAlert });
  const clock = tunisClock(now);

  return (
    <TabPage
      tab="home"
      title="Home"
      hero={<HomeHero {...clock} name={viewer.name} total={total} late={late} oldest={late ? oldest : null} />}
    >
      <FounderNumbers
        initial={viewer.role === "founder_2" ? "f2" : "f1"}
        f1={{ scripts: pace(scriptsApprovedThisWeek(scriptTasks, now), target, now) }}
        f2={{ videos: pace(videosApprovedThisWeek(editRounds, now), videoTarget || null, now), speed: speedSplit(tasks, productions, editRounds, now), waiting: waitingToLaunch(tasks, productions, editRounds, faces, hooks, now) }}
        blocked1={buildBlocked(scriptTasks, videoRows, now, true)}
        blocked2={buildBlocked(scriptTasks, videoRows, now, false)}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <CreateTaskButton ctx={ctx} pickers={pickers} />
          <TestimonialButton pickers={pickers} editors={editors} />
        </div>
        <NeedsMe groups={groups} total={total} editors={editors} allGroups={allGroups} pickers={pickers} tagPickers={tagPickers} />
      </FounderNumbers>
      <div className="unit" style={{ padding: "0 8px" }}>
        {live.hasData ? "Coming next with Meta: won / settled, cells needing a successor, and the ALERT and WINNER items." : "KILL and UNMAPPED items arrive with the first Meta pull (Meta not connected yet). Then: won / settled, cells needing a successor, ALERT and WINNER."}
      </div>
    </TabPage>
  );
}

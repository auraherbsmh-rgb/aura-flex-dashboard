import { perf } from "@/lib/perf";
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
import { getMapData } from "@/lib/tasks";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { LinkPending } from "@/components/LinkPending";
import { getPlanData } from "@/lib/plan";
import { carried, dayLabel, itemStage, whenLabel } from "@/lib/plan-shared";
import { buildVideoPipeline } from "@/lib/editing-shared";
import { buildBlocked, pace, scriptsApprovedThisWeek, speedSplit, successorNeeds, videosApprovedThisWeek, waitingToLaunch, winnersToNote, winRate } from "@/lib/home-shared";

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
  const mark = perf("home");
  const viewer = await requireTab("home");
  mark("auth");
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
  mark("data 2");
  const now = requestTime();
  const supabase = await createClient();
  mark("data 3");
  // Live ads (daily Meta pull): KILL and UNMAPPED items. Empty until Meta is connected.
  const mapP = getMapData();
  const planP = getPlanData(now);
  const [editors, live, formats, map, plan] = await Promise.all([
    getEditors(productions, tasks),
    getLiveData(now, mapP),
    supabase.from("list_items").select("id, code, label").eq("list", "format").eq("status", "approved").order("sort"),
    mapP,
    planP,
  ]);
  mark("data 4");
  // Meta results (concept_results): WINNER and ALERT items and Founder 1's two Meta numbers.
  const results = map.results;
  const faceOf = new Map(map.concepts.filter((c) => c.face).map((c) => [c.taskId, c.face as string]));
  const hooksOf = new Map(map.concepts.map((c) => [c.taskId, c.variations.map((v) => ({ v: v.v, type: v.type, line: v.line }))]));
  const avatarIdOf = new Map(pickers.avatars.map((a) => [a.code ?? "?", a.id])); // same key as TaskRow.avatarCode
  const winners = winnersToNote(tasks, results, faceOf, hooksOf);
  // The fading winner's ad set name is the successor's reference ad.
  const adSetOf = new Map(map.concepts.filter((c) => c.variations.length).map((c) => [c.taskId, c.variations[0].name.replace(/_V\d+$/i, "")]));
  const successors = successorNeeds(tasks, results, faceOf).map((x) => ({ ...x, avatarId: avatarIdOf.get(x.avatarCode) ?? null, reference: adSetOf.get(x.taskId) ?? x.face }));
  const hasResults = Object.keys(results).length > 0;
  const cards = prodCards(tasks, details, hooks);
  const tagPickers = { ...pickers, formats: (formats.data ?? []) as { id: string; code: string | null; label: string }[] };
  const prod = { cards, productions, footageLateDays, assignLateDays, editRounds, launchLateDays, launchNames, testimonials, kills: live.kills, unmapped: live.unmappedItems, winners, successors };
  const groups = buildNeeds(viewer, proposals, hours, now, tasks, reviewHours, prod);
  // "All": what each founder has on their own Home (so Founder 1 can see Founder 2's items, and the reverse).
  const asRole = (role: "founder_1" | "founder_2") => buildNeeds({ ...viewer, role }, proposals, hours, now, tasks, reviewHours, prod);
  const allGroups = mergeNeeds(asRole("founder_1"), asRole("founder_2"));
  const items = groups.flatMap((g) => g.items);
  const total = items.length;
  // Late = the late group plus KILL items (their own group on top) waiting 48h or more.
  const late = groups.filter((g) => g.name.startsWith("LATE")).reduce((n, g) => n + g.items.length, 0)
    + items.filter((i) => i.type === "KILL" && i.hours >= Math.min(hours, reviewHours)).length;
  // Oldest waiting = the longest wait on the founder (OVERDUE measures the copywriter's lateness, not a wait).
  const waits = items.filter((i) => i.type !== "OVERDUE" && i.type !== "UNMAPPED");
  const oldest = waits.length ? waits.reduce((a, b) => (b.hours > a.hours ? b : a)).age : null;

  // The three numbers. Scripts target = the copywriters' weekly targets (Settings → People);
  // videos target = Settings → Alerts → "Videos to deliver per week" (founder decision Oct 16).
  const target = ctx.copywriters.reduce((n, c) => n + (c.target ?? 0), 0) || null;
  const scriptTasks = tasks.filter((t) => t.origin !== "testimonial");
  const faces = new Map(details.map((d) => [d.taskId, d.face ?? ""]).filter(([, f]) => f) as [string, string][]);
  const videoRows = buildVideoPipeline(tasks, productions, editRounds, new Map(details.map((d) => [d.taskId, d])), { now, footageLateDays, assignLateDays, reviewHours, launchLateDays, roundAlert, prio: map.prio });
  const clock = tunisClock(now);
  // Monday plan: a banner until this week's plan is locked, then one line (founders; RLS hides it from anyone else).
  const byTask = new Map(tasks.map((t) => [t.id, t]));
  const planCarry = carried(plan.items, plan.week, (i) => itemStage(i, byTask, productions, editRounds)).length;
  const planNow = plan.items.filter((i) => i.weekStart === plan.week && !i.droppedAt).length;
  const planBlock = !plan.ok ? null : plan.plan?.lockedAt ? (
    <Link href="/plan" className="card plan-banner" style={{ textDecoration: "none", color: "inherit" }}>
      <span><b>This week&apos;s plan</b> <span className="sub">· locked {whenLabel(plan.plan.lockedAt)} · {planNow} item{planNow === 1 ? "" : "s"}{planCarry ? ` · ${planCarry} from last week` : ""}</span></span>
      <span className="sub"><LinkPending idle="Open →" /></span>
    </Link>
  ) : (
    <div className="card plan-banner" style={{ borderColor: "rgba(53,97,196,.25)" }}>
      <div>
        <div className="lbl">Week of {dayLabel(plan.week)} · both founders</div>
        <div style={{ fontSize: 20, fontWeight: 600, marginTop: 6 }}>This week isn&apos;t planned yet</div>
        <div className="sub" style={{ marginTop: 4 }}>{planCarry ? `${planCarry} item${planCarry === 1 ? "" : "s"} not finished last week. ` : ""}Review last week, then plan this one.</div>
      </div>
      <Link href="/plan" className="btn b-primary"><LinkPending idle="Plan the week →" /></Link>
    </div>
  );

  mark("computed");
  return (
    <TabPage
      tab="home"
      title="Home"
      hero={<HomeHero {...clock} name={viewer.name} total={total} late={late} oldest={late ? oldest : null} />}
    >
      {planBlock}
      <FounderNumbers
        initial={viewer.role === "founder_2" ? "f2" : "f1"}
        f1={{
          scripts: pace(scriptsApprovedThisWeek(scriptTasks, now), target, now),
          winRate: hasResults ? winRate(tasks, results, now) : null,
          successorCells: hasResults ? new Set(successors.map((x) => `${x.avatarCode}|${x.awareness}`)).size : null,
        }}
        f2={{ videos: pace(videosApprovedThisWeek(editRounds, now), videoTarget || null, now), speed: speedSplit(tasks, productions, editRounds, now), waiting: waitingToLaunch(tasks, productions, editRounds, faces, hooks, now) }}
        blocked1={buildBlocked(scriptTasks, videoRows, now, true)}
        blocked2={buildBlocked(scriptTasks, videoRows, now, false)}
      >
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <CreateTaskButton ctx={ctx} pickers={pickers} />
          <TestimonialButton pickers={pickers} editors={editors} />
        </div>
        <NeedsMe groups={groups} total={total} editors={editors} allGroups={allGroups} pickers={pickers} tagPickers={tagPickers} createCtx={ctx} />
      </FounderNumbers>
      <div className="unit" style={{ padding: "0 8px" }}>
        {live.hasData ? "KILL, UNMAPPED, WINNER and ALERT items and the two Meta numbers update every morning from the Meta pull." : live.noMoney ? "Meta items (KILL, UNMAPPED, WINNER, ALERT) need the money numbers: fill Settings → Money." : "KILL, UNMAPPED, WINNER and ALERT items and the two Meta numbers arrive with the first Meta pull (Meta not connected yet)."}
      </div>
    </TabPage>
  );
}

import { MoneyForm, PeopleForm, AddPersonForm, RulesForm, ListsBlock, CampaignRows, LevelsForm, MapStartForm, MetaPullForm, ShipperPullForm, CashOutHistory } from "./forms";
import type { getSettings } from "@/lib/settings/data";

export type SettingsData = Awaited<ReturnType<typeof getSettings>>;

const fmtDay = (d: string | null | undefined, withWeekday = false) =>
  d
    ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", {
        ...(withWeekday ? { weekday: "short" } : {}),
        day: "numeric",
        month: "short",
        timeZone: "UTC",
      })
    : "—";
const monthName = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", timeZone: "UTC" });

type Status = "green" | "amber" | "grey" | "red";
function Tag({ tone, children }: { tone: Status; children: React.ReactNode }) {
  return <span className={`tag t-${tone}`}><i aria-hidden="true" />{children}</span>;
}


/** Counts and statuses that are computed from the data, never typed (handoff §12.4, §13). */
export function summarize(s: SettingsData, today: string) {
  const active = s.people.filter((p) => p.active);
  const inactive = s.people.filter((p) => !p.active);
  const copywriters = active.filter((p) => p.role === "copywriter");
  const aiEditors = active.filter((p) => p.role === "editor" && p.does_ai_3d);

  // What is still to fill (handoff §12.4, §13) — computed, never typed.
  const copyPayToFill = copywriters.length === 0 || copywriters.some((p) => p.pay_amount_tnd === null);
  const rate3dToFill = aiEditors.length === 0 || aiEditors.some((p) => p.rate_3d_tnd === null);
  const stockToFill = s.rules.find((r) => r.key === "stock_red_days")?.value == null;
  const levelsToFill = s.levels.length === 0;
  const toFill = [copyPayToFill, rate3dToFill, stockToFill, levelsToFill].filter(Boolean).length;
  const moneyDue = !s.money || (s.money.next_ritual_on !== null && s.money.next_ritual_on < today);
  const metaOn = s.meta.ready && !!s.meta.last?.ok;
  const connectionsToMake = (metaOn ? 0 : 1) + 1; // Meta (daily pull) and Shipper (phase 4).
  const metaDetail = !s.meta.ready
    ? `daily pull by ad name · switched off: add ${[!s.meta.token && "META_ACCESS_TOKEN", !s.meta.serviceKey && "SUPABASE_SERVICE_ROLE_KEY", !s.meta.cronSecret && "CRON_SECRET"].filter(Boolean).join(", ")} in Vercel`
    : s.meta.last ? `last pull ${s.meta.last.started_at.slice(0, 16).replace("T", " ")} UTC · ${s.meta.last.message ?? ""}` : "ready · no pull yet (daily at 06:00, or Pull now)";
  const metaTone: Status = metaOn ? "green" : s.meta.ready && s.meta.last && !s.meta.last.ok ? "red" : "amber";
  const metaWord = metaOn ? "CONNECTED" : s.meta.ready && s.meta.last && !s.meta.last.ok ? "PULL FAILED" : s.meta.ready ? "READY" : "TO CONNECT";

  const shipLast = s.shipper.last;
  const shipOn = s.shipper.ready && !!shipLast?.ok;
  const shipDetail = !s.shipper.ready
    ? `daily pull · switched off: add ${[!s.shipper.key && "SHIPPER_API_KEY", !s.shipper.serviceKey && "SUPABASE_SERVICE_ROLE_KEY"].filter(Boolean).join(", ")} in Vercel`
    : shipLast ? `last pull ${shipLast.started_at.slice(0, 16).replace("T", " ")} UTC · ${shipLast.message ?? ""}` : "ready · no pull yet (daily at 06:30, or Pull now)";
  const shipTone: Status = shipOn ? "green" : s.shipper.ready && shipLast && !shipLast.ok ? "red" : "amber";
  const shipWord = shipOn ? "CONNECTED" : s.shipper.ready && shipLast && !shipLast.ok ? "PULL FAILED" : s.shipper.ready ? "READY" : "TO CONNECT";

  const moneyLine = s.money
    ? `Updated at the monthly ritual · last ${fmtDay(s.money.ritual_on)} (${monthName(s.money.month)} ${s.money.status}) · next ${fmtDay(s.money.next_ritual_on, true)}`
    : "Updated at the monthly ritual · not filled yet";

  const dataRows: { item: string; src: string; detail: string; tone: Status; status: string }[] = [
    { item: "Spend, sales, CPA, ROAS, CPM, CTR, frequency", src: "META API", detail: metaDetail, tone: metaTone, status: metaWord },
    { item: "Hook rate, hold, retention 25 / 50 / 75 / 100%", src: "META API", detail: "video plays and watched-% actions, same pull", tone: metaTone, status: metaWord },
    { item: "Leads, confirmed, shipped, delivered", src: "SHIPPER API", detail: shipDetail, tone: shipTone, status: shipWord },
    { item: "Stock left and cash at Shipper", src: "SHIPPER API", detail: "Aura Flex bottles at Shipper · delivered not paid yet · on its way", tone: shipTone, status: shipWord },
    {
      item: "Money numbers",
      src: "MANUAL",
      detail: s.money?.status === "provisional" ? "monthly ritual · close still provisional (orders open)" : "monthly ritual, section above",
      tone: moneyDue ? "red" : s.money?.status === "provisional" ? "amber" : "green",
      status: moneyDue ? "RITUAL DUE" : s.money?.status === "provisional" ? "PROVISIONAL" : "UP TO DATE",
    },
    { item: "Copywriter pay", src: "MANUAL", detail: "People and pay", tone: copyPayToFill ? "amber" : "green", status: copyPayToFill ? "TO FILL" : "FILLED" },
    { item: "3D generation rate · AI / 3D editor", src: "MANUAL", detail: "set at the first 3D launch", tone: rate3dToFill ? "amber" : "green", status: rate3dToFill ? "TO FILL" : "FILLED" },
    { item: "Copywriter levels and bonus rules", src: "MANUAL", detail: "section below · scorecard block 8 stays hidden until set", tone: levelsToFill ? "amber" : "green", status: levelsToFill ? "TO FILL" : "FILLED" },
    { item: "Winners alive, chain, speed, engine cost", src: "CALCULATED", detail: "from Meta, task dates and this page · waits for Meta", tone: "grey", status: "AUTOMATIC" },
  ];

  return { active, inactive, copyPayToFill, rate3dToFill, stockToFill, levelsToFill, toFill, moneyDue, connectionsToMake, moneyLine, dataRows };
}

/** The six Settings sections. Rendered by the real page and by the local preview with fixture data. */
export function SettingsSections({ s, today }: { s: SettingsData; today: string }) {
  const { active, inactive, levelsToFill, moneyLine, dataRows } = summarize(s, today);
  return (
    <>
      <section className="card sec" aria-labelledby="h-money">
        <div className="sh"><h2 id="h-money">Money</h2><span className="lbl">{moneyLine}</span></div>
        <MoneyForm money={s.money} />
      </section>

      <section className="card sec" aria-labelledby="h-people">
        <div className="sh"><h2 id="h-people">People and pay</h2><span className="lbl">Feeds the Creative engine costs</span></div>
        <div className="prow prow-head" aria-hidden="true">
          <span className="lbl">Person</span><span className="lbl">Pay</span><span className="lbl">Target / rate 2</span><span className="lbl">Login</span>
        </div>
        <PeopleForm people={active} inactive={inactive} />
        <div><AddPersonForm /></div>
      </section>

      <section className="card sec" aria-labelledby="h-alerts">
        <div className="sh"><h2 id="h-alerts">Alerts and late rules</h2><span className="lbl">Each one reaches the owner’s Home and the right pipeline</span></div>
        <RulesForm rules={s.rules} flags={s.flags} />
      </section>

      <section className="card sec" aria-labelledby="h-data">
        <div className="sh"><h2 id="h-data">Data and inputs</h2><span className="lbl">Where every number comes from</span></div>
        <div className="drow drow-head" aria-hidden="true">
          <span className="lbl">Item</span><span className="lbl">Source</span><span className="lbl">Detail</span><span className="lbl">Status</span>
        </div>
        {dataRows.map((r) => (
          <div className="drow" key={r.item}>
            <span><b style={{ fontWeight: 600 }}>{r.item}</b></span>
            <span><span className="src">{r.src}</span></span>
            <span className="unit">{r.detail}</span>
            <span><Tag tone={r.tone}>{r.status}</Tag></span>
          </div>
        ))}
        <div className="lbl" style={{ marginTop: 8 }}>Campaigns in scope · only these campaign IDs will be read (File 2 §1)</div>
        <CampaignRows campaigns={s.campaigns} />
        <MetaPullForm ready={s.meta.ready} />
        <ShipperPullForm ready={s.shipper.ready} />
        <CashOutHistory rows={s.cashOut} />
        <a className="btn b-ghost" href="/settings/shipper-check" style={{ alignSelf: "flex-start" }}>Check the Shipper connection →</a>
      </section>

      <section className="card sec" aria-labelledby="h-lists">
        <div className="sh"><h2 id="h-lists">Lists</h2><span className="lbl">Used in every picker and in ad names</span></div>
        <MapStartForm value={s.mapStart} />
        <ListsBlock items={s.lists} />
      </section>

      <section className="card sec" aria-labelledby="h-levels">
        <div className="sh">
          <h2 id="h-levels">Copywriter levels and bonus</h2>
          {levelsToFill ? <Tag tone="amber">TO FILL LATER</Tag> : <Tag tone="green">DRAFT SAVED</Tag>}
        </div>
        <div className="sub">Levels from the last 90 days (e.g. Building → Consistent → Scaling) and the bonus per level. Until this is filled, block 8 of the copywriter scorecard stays hidden.</div>
        <LevelsForm levels={s.levels} />
      </section>
    </>
  );
}

export function SettingsSwitch() {
  return <div className="switch recess"><span className="seg seg-on" aria-current="page">All settings</span></div>;
}

export function SettingsPills({ s, today }: { s: SettingsData; today: string }) {
  const { toFill, connectionsToMake } = summarize(s, today);
  return (
    <>
      <span className="pill raise"><b>{toFill}</b>inputs to fill</span>
      <span className="pill raise"><b>{connectionsToMake}</b>connections to make</span>
    </>
  );
}

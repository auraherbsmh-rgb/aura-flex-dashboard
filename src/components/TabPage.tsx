import type { TabKey } from "@/lib/access";
import { requireTab } from "@/lib/viewer";
import { AppHeader } from "./AppHeader";

/**
 * Frame for every tab: checks the role may see it, then draws the slab, header band and body.
 * `title` sits under the header like the artboards' 40px page title.
 */
export async function TabPage({
  tab,
  title,
  children,
}: {
  tab: TabKey;
  title: string;
  children: React.ReactNode;
}) {
  const viewer = await requireTab(tab);
  return (
    <main className="page">
      <div className="slab">
        <div className="band">
          <AppHeader viewer={viewer} active={tab} />
          <h1 className="h1" style={{ marginTop: 28 }}>{title}</h1>
        </div>
        <div className="body">{children}</div>
      </div>
    </main>
  );
}

/** Honest empty state for a screen whose phase has not been built yet. No sample numbers. */
export function NotBuiltYet({ phase, what }: { phase: string; what: string }) {
  return (
    <section className="tray" style={{ padding: 16 }}>
      <div className="card" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 10 }}>
        <span className="tag t-grey" style={{ alignSelf: "flex-start" }}>
          <i aria-hidden="true" />
          Not built yet · {phase}
        </span>
        <p style={{ margin: 0, fontSize: 15 }}>{what}</p>
      </div>
    </section>
  );
}

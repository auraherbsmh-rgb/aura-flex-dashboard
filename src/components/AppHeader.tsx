import Link from "next/link";
import { TABS, TABS_BY_ROLE, ROLE_SUBTITLE, SHOW_TAB_BAR, brandSubtitle, initials, type TabKey } from "@/lib/access";
import type { Viewer } from "@/lib/viewer";
import { signOut } from "@/app/actions";

/** Header band shared by every tab (artboards: logo · tab bar · person). Only the tabs this role may see are shown. */
export function AppHeader({ viewer, active, roleNote }: { viewer: Viewer; active: TabKey; roleNote?: string }) {
  const allowed = TABS_BY_ROLE[viewer.role];
  const tabs = TABS.filter((t) => allowed.includes(t.key));

  return (
    <header className="header">
      <Link href="/" className="brand" aria-label="Aura Flex, go to my first screen">
        <div className="logo" aria-hidden="true">AF</div>
        <div>
          <div className="brand-name">Aura Flex</div>
          <div className="brand-sub">{brandSubtitle(active)}</div>
        </div>
      </Link>

      {SHOW_TAB_BAR[viewer.role] && (
      <nav className="navbar recess" aria-label="Tabs">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={t.href}
            prefetch={true}
            className={t.key === active ? "nav nav-on" : "nav"}
            aria-current={t.key === active ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      )}

      <div className="who">
        <div className="avatar raise" aria-hidden="true">{initials(viewer.name)}</div>
        <div>
          <div className="who-name">{viewer.name}</div>
          <div className="who-role">{roleNote ?? ROLE_SUBTITLE[viewer.role]}</div>
        </div>
        <form action={signOut}>
          <button type="submit" className="btn b-quiet">Log out</button>
        </form>
      </div>
    </header>
  );
}

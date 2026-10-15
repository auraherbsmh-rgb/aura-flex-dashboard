import { signOut } from "@/app/actions";

export const metadata = { title: "No access · Aura Flex" };

export default function NoAccess() {
  return (
    <main className="page" style={{ minHeight: "100vh", display: "flex", alignItems: "center" }}>
      <div className="slab" style={{ maxWidth: 480, width: "100%" }}>
        <div className="band">
          <h1 className="h1" style={{ fontSize: 32 }}>No access</h1>
          <p className="sub" style={{ margin: "8px 0 0" }}>
            This email is not active on the team. A founder can add or reactivate you in Settings.
          </p>
        </div>
        <div className="body">
          <form action={signOut}>
            <button className="btn b-ghost" type="submit">Log out</button>
          </form>
        </div>
      </div>
    </main>
  );
}

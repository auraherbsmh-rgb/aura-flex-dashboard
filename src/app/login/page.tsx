import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Log in · Aura Flex" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) redirect("/");

  const { error } = await searchParams;

  return (
    <main className="page" style={{ minHeight: "100vh", display: "flex", alignItems: "center" }}>
      <div className="slab" style={{ maxWidth: 480, width: "100%" }}>
        <div className="band">
          <div className="brand">
            <div className="logo" aria-hidden="true">AF</div>
            <div>
              <div className="brand-name">Aura Flex</div>
              <div className="brand-sub">Team dashboard</div>
            </div>
          </div>
          <h1 className="h1" style={{ marginTop: 28, fontSize: 32 }}>Log in</h1>
          <p className="sub" style={{ margin: "8px 0 0" }}>We email you a link. No password to remember.</p>
        </div>
        <div className="body">
          <div className="card" style={{ padding: 24 }}>
            <LoginForm linkError={error === "link"} />
          </div>
          <p className="sub" style={{ margin: 0, padding: "0 8px" }}>
            No access yet? A founder adds you in Settings first.
          </p>
        </div>
      </div>
    </main>
  );
}

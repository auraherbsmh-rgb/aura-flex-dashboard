"use server";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export type LoginState = { status: "idle" | "sent" | "error"; message?: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sends a one-click login link. The database only accepts emails a founder added in Settings,
 * but the answer is the same either way, so the page never reveals who is on the team.
 */
export async function sendLoginLink(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL.test(email)) return { status: "error", message: "Enter a valid email address." };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${proto}://${host}/auth/confirm`, shouldCreateUser: true },
  });

  if (error && error.status === 429) {
    return { status: "error", message: "Too many links asked for. Wait a few minutes and try again." };
  }
  // Any other error (including an email not on the team) gets the same neutral answer on screen,
  // but is written to the server log so a real sending failure is visible to us.
  if (error) console.error("login link not sent", { status: error.status, code: error.code, message: error.message });
  return { status: "sent" };
}

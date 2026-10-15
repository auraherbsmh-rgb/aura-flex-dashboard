"use client";

import { useActionState } from "react";
import { sendLoginLink, type LoginState } from "./actions";

const initial: LoginState = { status: "idle" };

export function LoginForm({ linkError }: { linkError: boolean }) {
  const [state, action, pending] = useActionState(sendLoginLink, initial);

  if (state.status === "sent") {
    return (
      <div className="notice notice-green" role="status">
        <b>Check your email.</b> If this address is on the team, a login link is on its way. Open it on this device.
      </div>
    );
  }

  return (
    <form action={action} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {linkError && (
        <div className="notice notice-red" role="alert">
          That login link has expired or was already used. Ask for a new one.
        </div>
      )}
      {state.status === "error" && (
        <div className="notice notice-red" role="alert">
          {state.message}
        </div>
      )}
      <div>
        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input id="email" name="email" type="email" autoComplete="email" required className="fin" placeholder="you@example.com" />
      </div>
      <button type="submit" className="btn b-primary" disabled={pending}>
        {pending ? "Sending…" : "Send me a login link"}
      </button>
    </form>
  );
}

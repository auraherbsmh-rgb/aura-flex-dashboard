"use client";

import { useLinkStatus } from "next/link";

/** Inside a <Link>: shows "Opening…" the instant it is clicked, until the next page is on screen. */
export function LinkPending({ idle, busy = "Opening…" }: { idle: React.ReactNode; busy?: string }) {
  const { pending } = useLinkStatus();
  return <span aria-live="polite">{pending ? busy : idle}</span>;
}

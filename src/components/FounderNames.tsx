"use client";

import { createContext, useCallback, useContext } from "react";
import { DEFAULT_FOUNDERS, withFounderNames, type FounderNames } from "@/lib/founders-shared";

const Ctx = createContext<FounderNames>(DEFAULT_FOUNDERS);

/** Every tab: the founders' names from Settings → People, so "Founder 1 / 2" read as their real names. */
export function FounderNamesProvider({ names, children }: { names: FounderNames; children: React.ReactNode }) {
  return <Ctx.Provider value={names}>{children}</Ctx.Provider>;
}

export function useFounderNames(): FounderNames {
  return useContext(Ctx);
}

/** t("Founder 2 · Assign") → "Ghazi · Assign". */
export function useFounderText() {
  const n = useContext(Ctx);
  return useCallback((s: string) => withFounderNames(s, n), [n]);
}


/** Text with "Founder 1 / 2" shown as the founders' names: <F>{"Founder 2 · Assign"}</F>. */
export function F({ children }: { children: string }) {
  const t = useFounderText();
  return <>{t(children)}</>;
}

"use client";

import { useEffect } from "react";

/** Phones: the tab bar scrolls sideways; this keeps the open tab in view (e.g. Settings, the last one). */
export function NavScroll() {
  useEffect(() => {
    const on = document.querySelector<HTMLElement>(".navbar .nav-on");
    const bar = on?.parentElement;
    if (on && bar && bar.scrollWidth > bar.clientWidth) bar.scrollLeft = Math.max(0, on.getBoundingClientRect().left - bar.getBoundingClientRect().left + bar.scrollLeft - 16);
  }, []);
  return null;
}

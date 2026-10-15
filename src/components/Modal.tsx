"use client";

import { useEffect, useRef } from "react";

/**
 * Pop-up frame used by every pop-up (handoff §6b, §15): centered, page dimmed and blurred behind,
 * white card with the highest shadow, × to close, Esc closes, focus moves into it and back on close.
 */
export function Modal({
  open,
  onClose,
  who,
  title,
  width = 560,
  children,
}: {
  open: boolean;
  onClose: () => void;
  who: string;
  title: string;
  width?: number;
  children: React.ReactNode;
}) {
  const card = useRef<HTMLDivElement>(null);
  const returnTo = useRef<Element | null>(null);
  // Latest onClose without re-running the open effect on every keystroke (that would steal focus).
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    returnTo.current = document.activeElement;
    const first = card.current?.querySelector<HTMLElement>("input, select, textarea, button:not([data-close])");
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeRef.current();
      if (e.key === "Tab" && card.current) {
        // Keep Tab inside the pop-up.
        const items = card.current.querySelectorAll<HTMLElement>("a[href], button:not([disabled]), input, select, textarea");
        if (!items.length) return;
        const firstEl = items[0];
        const lastEl = items[items.length - 1];
        if (e.shiftKey && document.activeElement === firstEl) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); firstEl.focus(); }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      (returnTo.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="veil" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={card} className="pop" role="dialog" aria-modal="true" aria-label={title} style={{ width }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
          <div>
            <div className="pop-who">{who}</div>
            <h2 className="ttl">{title}</h2>
          </div>
          <button type="button" className="x" onClick={onClose} aria-label="Close" data-close>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

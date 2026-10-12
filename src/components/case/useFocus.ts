"use client";

import { useEffect } from "react";

// Scrolls a gate finding's target into view and flashes it, so a click on a
// blocker lands the owner on the exact field that resolves it.
export function useFocusTarget(focus: string | null, ready: boolean) {
  useEffect(() => {
    if (!focus || !ready) return;
    const t = setTimeout(() => {
      const el = document.getElementById(`focus-${focus}`);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      el.classList.remove("focus-flash");
      void el.offsetWidth;
      el.classList.add("focus-flash");
      el.querySelector<HTMLElement>("textarea, input, select")?.focus({ preventScroll: true });
    }, 120);
    return () => clearTimeout(t);
  }, [focus, ready]);
}

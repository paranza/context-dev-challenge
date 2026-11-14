"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";
function subscribe(onChange: () => void) {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}
function getSnapshot() { return window.matchMedia(QUERY).matches; }
function getServerSnapshot() { return false; }

// A matching server/initial-hydration snapshot avoids mismatched controls;
// the subscribed client snapshot also handles preference changes mid-session.
export function usePrefersReducedMotion() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

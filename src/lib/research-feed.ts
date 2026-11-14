"use client";

import type { ResearchProgress } from "./research-progress";

const empty: ResearchProgress[] = [];
let events: ResearchProgress[] = empty;
const listeners = new Set<() => void>();

// The progress feed lives outside the page's hook signature so refreshing this
// UI during a running scan preserves the request and its elapsed start time.
export const researchFeed = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot() { return events; },
  getServerSnapshot() { return empty; },
  reset() { events = empty; listeners.forEach((listener) => listener()); },
  push(event: ResearchProgress) { events = [...events, event].slice(-80); listeners.forEach((listener) => listener()); },
};

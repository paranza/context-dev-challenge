"use client";

import type { ResearchProgress } from "./research-progress";

const empty: ResearchProgress[] = [];
let events: ResearchProgress[] = empty;
const listeners = new Set<() => void>();

// The progress feed lives outside the page's hook signature so refreshing this
// UI during a running scan preserves the request and its elapsed start time.
// Keep the request's stage milestones: multi-country discovery can emit more
// than 80 updates. The server bounds each page and the next request resets it.
export const researchFeed = {
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  getSnapshot() { return events; },
  getServerSnapshot() { return empty; },
  reset() { events = empty; listeners.forEach((listener) => listener()); },
  push(event: ResearchProgress) { events = [...events, event]; listeners.forEach((listener) => listener()); },
};

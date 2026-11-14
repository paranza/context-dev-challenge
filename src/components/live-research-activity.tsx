"use client";

import { useSyncExternalStore } from "react";
import { researchFeed } from "@/lib/research-feed";
import { ResearchActivity } from "./research-activity";

export function LiveResearchActivity({ startedAt, companyUrl }: { startedAt: number; companyUrl: string }) {
  const events = useSyncExternalStore(researchFeed.subscribe, researchFeed.getSnapshot, researchFeed.getServerSnapshot);
  return <ResearchActivity startedAt={startedAt} companyUrl={companyUrl} events={events} />;
}

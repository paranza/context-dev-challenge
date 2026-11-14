import type { ScanResult, TenderChange } from "./types";

export type ResearchStage = "supplier" | "discovery" | "analysis";

export type ResearchProgress = {
  stage: ResearchStage;
  status: "active" | "complete" | "info";
  message: string;
  source?: { label: string; url: string };
  count?: number;
};

export type ResearchStreamEvent =
  | { type: "progress"; progress: ResearchProgress }
  | { type: "result"; result: ScanResult & { changes: TenderChange[] } }
  | { type: "error"; error: string };

export type ResearchProgressListener = (progress: ResearchProgress) => void;

import { isTenderPageResult, isTenderResult, normalizeScanResult } from "./client-scan";
import type { ResearchProgress } from "./research-progress";
import type { ScanProgressEvent, ScanResult, TenderChange, TenderPageResult } from "./types";

export type ScanResponse = ScanResult & { changes: TenderChange[] };

function record(value: unknown): value is Record<string, unknown> { return !!value && typeof value === "object" && !Array.isArray(value); }
function readableError(value: unknown, page = false): string {
  const message = typeof value === "string" && value ? value : "The research could not be completed. Please try again.";
  if (message.includes("not configured")) return "Live research is temporarily unavailable. You can explore the sample workspace while it is being set up.";
  if (page && /cursor|continuation token|token.*(?:expired|invalid)|(?:expired|invalid).*token/i.test(message)) return "This research session has expired or is invalid. Refresh research to start again.";
  return message;
}

function completeScan(value: unknown): ScanResponse {
  const scan = normalizeScanResult(value);
  if (!scan) throw new Error("The scan returned an incomplete result. Please try again.");
  const changes = record(value) && Array.isArray(value.changes) ? value.changes.filter((item): item is TenderChange =>
    record(item) && typeof item.tenderId === "string" && typeof item.tenderTitle === "string" &&
    ["new", "changed", "removed"].includes(item.kind as string) && Array.isArray(item.details) && item.details.every((detail: unknown) => typeof detail === "string"),
  ) : [];
  return { ...scan, changes };
}
function completePage(value: unknown): TenderPageResult {
  if (!isTenderPageResult(value)) throw new Error("The next page returned an incomplete result. Your existing research is still available.");
  return value;
}
function isLegacyProgress(value: unknown): value is ResearchProgress {
  if (!record(value)) return false;
  return ["supplier", "discovery", "analysis"].includes(value.stage as string) &&
    ["active", "complete", "info"].includes(value.status as string) && typeof value.message === "string" &&
    (value.count === undefined || (typeof value.count === "number" && Number.isFinite(value.count))) &&
    (value.source === undefined || (record(value.source) && typeof value.source.label === "string" && typeof value.source.url === "string" && /^https?:\/\//i.test(value.source.url)));
}
function isEngineProgress(value: unknown): value is ScanProgressEvent {
  return record(value) && ["stage", "source", "tender", "error"].includes(value.type as string) && typeof value.stage === "string" && typeof value.message === "string" &&
    (value.sourceUrl === undefined || (typeof value.sourceUrl === "string" && /^https?:\/\//i.test(value.sourceUrl))) &&
    (value.countryCode === undefined || typeof value.countryCode === "string") &&
    (value.query === undefined || typeof value.query === "string") &&
    (value.completed === undefined || (typeof value.completed === "number" && Number.isFinite(value.completed))) &&
    (value.total === undefined || (typeof value.total === "number" && Number.isFinite(value.total))) &&
    (value.tender === undefined || isTenderResult(value.tender));
}

// Document and matching work interleave across concurrent notices. Advance the
// stage once, then keep later notice updates informational instead of regressing
// completed stages or interpreting concurrent map indexes as a percentage.
function progressAdapter(onProgress: (event: ResearchProgress) => void, page: boolean) {
  let active = page ? 0 : -1;
  const stages = ["supplier", "discovery", "analysis"] as const;
  const completedTenders = new Set<string>();
  const completedStages = new Set<string>();
  const finishStage = (index: number, message: string) => {
    if (completedStages.has(stages[index])) return;
    completedStages.add(stages[index]);
    onProgress({ stage: stages[index], status: "complete", message });
  };
  return (event: ScanProgressEvent) => {
    if (page) finishStage(0, "Reusing this company’s research.");
    const index = event.stage === "supplier" ? 0 : event.stage === "discovery" ? 1 : 2;
    if (event.stage === "complete") {
      for (let i = 0; i < stages.length; i++) finishStage(i, i === 2 ? event.message : i === 0 ? "Business research completed." : "Procurement source discovery completed.");
      active = 3;
      return;
    }
    if (index > active) {
      for (let i = Math.max(0, active); i < index; i++) finishStage(i, i === 0 ? "Business research completed." : "Procurement source discovery completed.");
      active = index;
    }
    let count: number | undefined;
    if (event.type === "tender" && event.tender) { completedTenders.add(event.tender.id); count = completedTenders.size; }
    const sourceUrl = event.sourceUrl || event.tender?.url;
    const progress: ResearchProgress = {
      stage: stages[index],
      status: event.type === "stage" && index === active && !completedStages.has(stages[index]) ? "active" : "info",
      message: event.message,
      ...(sourceUrl ? { source: { label: event.tender?.title || event.countryCode || "Research source", url: sourceUrl } } : {}),
      ...(count === undefined ? {} : { count }),
    };
    onProgress(progress);
  };
}

/** Decode named engine SSE, the previous envelope format, and JSON responses. */
async function readResponse<T>(response: Response, onProgress: (event: ResearchProgress) => void, complete: (value: unknown) => T, page: boolean): Promise<T> {
  const engineProgress = progressAdapter(onProgress, page);
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    let value: unknown;
    try { value = await response.json(); }
    catch { throw new Error("The research service could not return a complete result. Please try again."); }
    if (!response.ok) throw new Error(readableError(record(value) ? value.error : undefined, page));
    return complete(value);
  }
  if (!response.ok || !response.body) throw new Error("The live research connection could not be opened. Please try again.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: { value: T } | null = null;
  function consume(frame: string) {
    const lines = frame.split(/\r?\n/);
    const name = lines.find(line => line.startsWith("event:"))?.slice(6).trim() || "message";
    const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
    if (!data) return; // Heartbeat comments have no data payload.
    let event: unknown;
    try { event = JSON.parse(data); }
    catch { throw new Error("The research connection returned an unreadable update. Please try again."); }
    if (!record(event)) return;
    if ((name === "error" || event.type === "error") && typeof event.error === "string") throw new Error(readableError(event.error, page));
    if (name === "complete") { result = { value: complete(event) }; return; }
    if (event.type === "result") { result = { value: complete(event.result) }; return; }
    if (event.type === "progress" && isLegacyProgress(event.progress)) { onProgress(event.progress); return; }
    if (["stage", "source", "tender", "error", "message"].includes(name) && isEngineProgress(event)) engineProgress(event);
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) { consume(frame); if (result) break; }
      if (result) { await reader.cancel().catch(() => undefined); return (result as { value: T }).value; }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (result) return (result as { value: T }).value;
    throw new Error("The research connection ended before the results were ready. Please try again.");
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  } finally { reader.releaseLock(); }
}

export function readResearchResponse(response: Response, onProgress: (event: ResearchProgress) => void): Promise<ScanResponse> {
  return readResponse(response, onProgress, completeScan, false);
}
export function readTenderPageResponse(response: Response, onProgress: (event: ResearchProgress) => void): Promise<TenderPageResult> {
  return readResponse(response, onProgress, completePage, true);
}

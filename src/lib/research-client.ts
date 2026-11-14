import { isScanResult } from "./client-scan";
import type { ResearchProgress, ResearchStreamEvent } from "./research-progress";
import type { ScanResult, TenderChange } from "./types";

export type ScanResponse = ScanResult & { changes: TenderChange[] };

function readableError(value: unknown): string {
  const message = typeof value === "string" && value ? value : "The research could not be completed. Please try again.";
  return message.includes("not configured")
    ? "Live research is temporarily unavailable. You can explore the sample workspace while it is being set up."
    : message;
}

function completeScan(value: unknown): ScanResponse {
  if (!isScanResult(value)) throw new Error("The scan returned an incomplete result. Please try again.");
  const raw = value as ScanResult & { changes?: unknown };
  const changes = Array.isArray(raw.changes) ? raw.changes.filter((item): item is TenderChange =>
    !!item && typeof item === "object" && typeof item.tenderId === "string" && typeof item.tenderTitle === "string" &&
    ["new", "changed", "removed"].includes(item.kind) && Array.isArray(item.details) && item.details.every((detail: unknown) => typeof detail === "string"),
  ) : [];
  return { ...value, changes };
}

function isProgress(value: unknown): value is ResearchProgress {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ResearchProgress>;
  return ["supplier", "discovery", "analysis"].includes(item.stage ?? "") &&
    ["active", "complete", "info"].includes(item.status ?? "") && typeof item.message === "string" &&
    (item.count === undefined || (typeof item.count === "number" && Number.isFinite(item.count))) &&
    (item.source === undefined || (item.source !== null && typeof item.source === "object" && typeof item.source.label === "string" && typeof item.source.url === "string" && /^https?:\/\//i.test(item.source.url)));
}

/** Accept legacy JSON and incremental SSE. Decode UTF-8 across arbitrary chunks. */
export async function readResearchResponse(response: Response, onProgress: (event: ResearchProgress) => void): Promise<ScanResponse> {
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    let value: unknown;
    try { value = await response.json(); }
    catch { throw new Error("The research service could not return a complete result. Please try again."); }
    if (!response.ok) throw new Error(readableError(value && typeof value === "object" && "error" in value ? value.error : undefined));
    return completeScan(value);
  }
  if (!response.ok || !response.body) throw new Error("The live research connection could not be opened. Please try again.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let result: ScanResponse | null = null;

  function consume(frame: string) {
    const data = frame.split(/\r?\n/).filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n");
    if (!data) return; // SSE heartbeat comments are not research events.
    let event: ResearchStreamEvent;
    try { event = JSON.parse(data) as ResearchStreamEvent; }
    catch { throw new Error("The research connection returned an unreadable update. Please try again."); }
    if (!event || typeof event !== "object") return;
    if (event.type === "progress" && isProgress(event.progress)) onProgress(event.progress);
    if (event.type === "error") throw new Error(readableError(event.error));
    if (event.type === "result") result = completeScan(event.result);
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const frames = buffer.split(/\r?\n\r?\n/);
      buffer = frames.pop() ?? "";
      for (const frame of frames) consume(frame);
      if (result) { await reader.cancel().catch(() => undefined); return result; }
      if (done) break;
    }
    if (buffer.trim()) consume(buffer);
    if (result) return result;
    throw new Error("The research connection ended before the results were ready. Please try again.");
  } finally { reader.releaseLock(); }
}

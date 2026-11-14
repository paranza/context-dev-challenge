import { compareSnapshots, continueTenderScan, runTenderScan } from "./context";
import { normalizeScanResult } from "./client-scan";
import type { ScanProgressEvent } from "./types";

type Progress = (event: ScanProgressEvent) => void;

function serialize(value: unknown) {
  const json = JSON.stringify(value) ?? "null";
  const key = process.env.CONTEXT_DEV_API_KEY;
  return key ? json.split(key).join("[redacted]") : json;
}

function json(value: unknown, status = 200) {
  return new Response(serialize(value), { status, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" } });
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "The research could not be completed. Please try again.";
}

function errorStatus(message: string) {
  if (message.includes("not configured")) return 503;
  if (/continuation token|full company website/i.test(message)) return 400;
  return 502;
}

/** Named events preserve completed-tender payloads. Disconnecting the reader
 * stops transport work without cancelling research already in progress. */
function streamResearch(request: Request, operation: (progress: Progress) => Promise<unknown>) {
  const encoder = new TextEncoder();
  let closed = false;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let disconnect: (() => void) | undefined;
  const cleanup = () => {
    if (heartbeat) clearInterval(heartbeat);
    if (disconnect) request.signal.removeEventListener("abort", disconnect);
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const finish = () => {
        if (closed) return;
        closed = true;
        cleanup();
        try { controller.close(); } catch { /* The reader already disconnected. */ }
      };
      const enqueue = (data: string) => {
        if (closed) return;
        try { controller.enqueue(encoder.encode(data)); }
        catch { closed = true; cleanup(); }
      };
      const send = (name: string, value: unknown) => enqueue(`event: ${name}\ndata: ${serialize(value)}\n\n`);
      disconnect = finish;
      if (request.signal.aborted) { finish(); return; }
      request.signal.addEventListener("abort", disconnect, { once: true });
      heartbeat = setInterval(() => enqueue(": keep-alive\n\n"), 15_000);

      void operation((event) => send(event.type, event))
        .then((result) => send("complete", result))
        .catch((error) => send("error", { error: errorMessage(error) }))
        .finally(finish);
    },
    cancel() { closed = true; cleanup(); },
  });

  return new Response(stream, { headers: {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  } });
}

async function bodyRecord(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const value: unknown = await request.json();
    return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch { return null; }
}

export async function handleInitialResearch(request: Request, forceStream = false) {
  const body = await bodyRecord(request);
  if (!body) return json({ error: "Request body must be a valid JSON object." }, 400);
  if (typeof body.companyUrl !== "string" || !body.companyUrl.trim()) return json({ error: "Enter your company's website address." }, 400);
  const companyUrl = body.companyUrl;
  const previous = normalizeScanResult(body.previous);
  const operation = async (onProgress?: Progress) => {
    const result = await runTenderScan(companyUrl, { onProgress });
    return { ...result, changes: compareSnapshots(previous, result) };
  };
  if (forceStream || request.headers.get("accept")?.includes("text/event-stream")) return streamResearch(request, operation);
  try { return json(await operation()); }
  catch (error) { const message = errorMessage(error); return json({ error: message }, errorStatus(message)); }
}

export async function handleResearchPage(request: Request, forceStream = false) {
  const body = await bodyRecord(request);
  if (!body) return json({ error: "Request body must be a valid JSON object." }, 400);
  if (typeof body.cursor !== "string" || !body.cursor.trim()) return json({ error: "A continuation cursor is required." }, 400);
  const cursor = body.cursor;
  const operation = (onProgress?: Progress) => continueTenderScan(cursor, { onProgress });
  if (forceStream || request.headers.get("accept")?.includes("text/event-stream")) return streamResearch(request, operation);
  try { return json(await operation()); }
  catch (error) { const message = errorMessage(error); return json({ error: message }, errorStatus(message)); }
}

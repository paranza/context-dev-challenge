import { NextResponse } from "next/server";
import { compareSnapshots, runTenderScan } from "@/lib/context";
import type { ScanResult } from "@/lib/types";
import type { ResearchStreamEvent } from "@/lib/research-progress";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: { companyUrl?: unknown; previous?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body.companyUrl !== "string") {
    return NextResponse.json({ error: "Enter your company's website address." }, { status: 400 });
  }

  if (request.headers.get("accept")?.includes("text/event-stream")) {
    const companyUrl = body.companyUrl;
    const previous = body.previous && typeof body.previous === "object" ? body.previous as ScanResult : null;
    const encoder = new TextEncoder();
    let closed = false;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        function send(event: ResearchStreamEvent) {
          if (closed) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          } catch {
            closed = true;
          }
        }

        // Keep an idle connection open during long upstream reads. Comments are
        // transport heartbeats, not research progress or invented stage updates.
        heartbeat = setInterval(() => {
          if (closed) return;
          try { controller.enqueue(encoder.encode(": keep-alive\n\n")); }
          catch { closed = true; }
        }, 15_000);

        void (async () => {
          try {
            const result = await runTenderScan(companyUrl, (progress) => send({ type: "progress", progress }));
            send({ type: "result", result: { ...result, changes: compareSnapshots(previous, result) } });
          } catch (error) {
            let message = error instanceof Error ? error.message : "The live research scan failed. Try again.";
            const key = process.env.CONTEXT_DEV_API_KEY;
            if (key) message = message.split(key).join("[redacted]");
            send({ type: "error", error: message });
          } finally {
            if (heartbeat) clearInterval(heartbeat);
            if (!closed) {
              try { controller.close(); } catch { /* The reader may have disconnected. */ }
            }
            closed = true;
          }
        })();
      },
      cancel() {
        // Continue the already-started scan. A closing progress view must not
        // abort the underlying work or turn a completed read into a failure.
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  }

  try {
    const result = await runTenderScan(body.companyUrl);
    const previous = body.previous && typeof body.previous === "object" ? body.previous as ScanResult : null;
    return NextResponse.json({ ...result, changes: compareSnapshots(previous, result) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The live research scan failed. Try again.";
    const status = message.includes("not configured") ? 503 : message.includes("full company website") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

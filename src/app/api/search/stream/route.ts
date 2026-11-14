import { compareSnapshots, runTenderScan } from "@/lib/context";
import type { ScanResult } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: { companyUrl?: unknown; previous?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body.companyUrl !== "string") {
    return Response.json({ error: "Enter your company's website address." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (name: string, payload: unknown) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode("event: " + name + "\ndata: " + JSON.stringify(payload) + "\n\n"));
      };
      void runTenderScan(body.companyUrl as string, {
        onProgress: (event) => send(event.type, event),
      }).then((result) => {
        const previous = body.previous && typeof body.previous === "object" ? body.previous as ScanResult : null;
        send("complete", { ...result, changes: compareSnapshots(previous, result) });
      }).catch((error) => {
        const message = error instanceof Error ? error.message : "The live research scan failed. Try again.";
        send("error", { error: message });
      }).finally(() => {
        if (!cancelled) controller.close();
      });
    },
    cancel() { cancelled = true; },
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

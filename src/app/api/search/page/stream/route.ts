import { continueTenderScan } from "@/lib/context";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: { cursor?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body.cursor !== "string" || !body.cursor) {
    return Response.json({ error: "A continuation cursor is required." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (name: string, payload: unknown) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode("event: " + name + "\ndata: " + JSON.stringify(payload) + "\n\n"));
      };
      void continueTenderScan(body.cursor as string, {
        onProgress: (event) => send(event.type, event),
      }).then((result) => send("complete", result)).catch((error) => {
        const message = error instanceof Error ? error.message : "The next tender page could not be researched.";
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

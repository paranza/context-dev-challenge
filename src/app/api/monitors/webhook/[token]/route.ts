import { pauseExpiredMonitorForWebhook } from "@/lib/monitors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 15;
type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: Request, { params }: RouteContext) {
  const rawBody = Buffer.from(await request.arrayBuffer());
  try {
    const { token } = await params;
    const result = await pauseExpiredMonitorForWebhook(token, rawBody, request.headers);
    if (result === "unauthorized") return new Response("Invalid webhook signature.", { status: 401 });
    if (result === "bad_request") return new Response("Invalid webhook event.", { status: 400 });
    return new Response(null, { status: 204 });
  } catch {
    return new Response("Webhook processing failed.", { status: 503 });
  }
}


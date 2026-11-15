import { NextResponse } from "next/server";
import { createTenderMonitor } from "@/lib/monitors";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const requestsByIp = new Map<string, number[]>();

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  if (origin && host) {
    try {
      if (new URL(origin).host !== host) return NextResponse.json({ error: "Cross-site monitor requests are not accepted." }, { status: 403 });
    } catch {
      return NextResponse.json({ error: "The request origin is invalid." }, { status: 403 });
    }
  }

  const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const recent = (requestsByIp.get(ip) ?? []).filter((time) => Date.now() - time < 60 * 60_000);
  if (recent.length >= 8) return NextResponse.json({ error: "Too many monitors were created from this connection. Try again later." }, { status: 429 });
  recent.push(Date.now());
  requestsByIp.set(ip, recent);
  if (requestsByIp.size > 1_000) {
    for (const [key, times] of requestsByIp) if (!times.some((time) => Date.now() - time < 60 * 60_000)) requestsByIp.delete(key);
  }

  let body: Record<string, unknown>;
  try {
    const parsed: unknown = await request.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
  const frequencyHours = body.frequencyHours === 24 ? 24 : body.frequencyHours === 6 ? 6 : null;
  if (!frequencyHours || typeof body.tenderId !== "string" || typeof body.title !== "string" || typeof body.url !== "string" || typeof body.endsAt !== "string") {
    return NextResponse.json({ error: "Tender, end date, and scan interval are required." }, { status: 400 });
  }

  try {
    const monitor = await createTenderMonitor({
      tenderId: body.tenderId,
      title: body.title,
      url: body.url,
      endsAt: body.endsAt,
      frequencyHours,
    });
    return NextResponse.json(monitor, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "The tender monitor could not be created.";
    const status = message.includes("not configured") ? 503 : message.includes("registered public procurement") || message.includes("Choose an end date") || message.includes("missing or too long") || message.includes("interval") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}


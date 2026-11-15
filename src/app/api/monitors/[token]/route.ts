import { NextResponse } from "next/server";
import { pauseTenderMonitor, retrieveTenderMonitor } from "@/lib/monitors";

export const dynamic = "force-dynamic";
export const maxDuration = 45;
type RouteContext = { params: Promise<{ token: string }> };

export async function GET(_request: Request, { params }: RouteContext) {
  try {
    const { token } = await params;
    return NextResponse.json(await retrieveTenderMonitor(token));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The monitor status could not be loaded.";
    const status = message.includes("token") ? 400 : message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(_request: Request, { params }: RouteContext) {
  try {
    const { token } = await params;
    return NextResponse.json(await pauseTenderMonitor(token));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The monitor could not be paused.";
    const status = message.includes("token") ? 400 : message.includes("not configured") ? 503 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}


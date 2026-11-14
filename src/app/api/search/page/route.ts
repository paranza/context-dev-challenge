import { NextResponse } from "next/server";
import { continueTenderScan } from "@/lib/context";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request) {
  let body: { cursor?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  if (typeof body.cursor !== "string" || !body.cursor) {
    return NextResponse.json({ error: "A continuation cursor is required." }, { status: 400 });
  }
  try {
    return NextResponse.json(await continueTenderScan(body.cursor));
  } catch (error) {
    const message = error instanceof Error ? error.message : "The next tender page could not be researched.";
    const status = message.includes("token") || message.includes("expired") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

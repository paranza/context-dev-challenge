import { NextResponse } from "next/server";
import { compareSnapshots, runTenderScan } from "@/lib/context";
import type { ScanResult } from "@/lib/types";

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

  try {
    const result = await runTenderScan(body.companyUrl);
    const previous = body.previous && typeof body.previous === "object" ? body.previous as ScanResult : null;
    return NextResponse.json({ ...result, changes: compareSnapshots(previous, result) });
  } catch (error) {
    console.error("[api/search] Tender scan failed:", error);
    const message = error instanceof Error ? error.message : "The live research scan failed. Try again.";
    const status = message.includes("not configured") ? 503 : message.includes("full company website") ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}

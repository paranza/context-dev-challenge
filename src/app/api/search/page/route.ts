import { handleResearchPage } from "@/lib/research-http";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
export async function POST(request: Request) { return handleResearchPage(request); }

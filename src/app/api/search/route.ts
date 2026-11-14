import { NextResponse } from "next/server";
export async function POST(req:Request){
 const {companyUrl}=await req.json();
 if(!companyUrl || !/^https?:\/\//i.test(companyUrl)) return NextResponse.json({error:"Enter a valid company website URL."},{status:400});
 const key=process.env.CONTEXT_DEV_API_KEY;
 if(!key) return NextResponse.json({error:"Context.dev is not configured. Add CONTEXT_DEV_API_KEY to .env.local."},{status:503});
 try {
  const response=await fetch("https://api.context.dev/v1/web/search",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({query:`Current open public construction tenders Finland Hilma supplier deadline site:${new URL(companyUrl).hostname}`}),cache:"no-store"});
  const body=await response.json(); if(!response.ok) return NextResponse.json({error:body.message||"Tender search failed",detail:body.error_code},{status:response.status});
  return NextResponse.json({results:body,companyUrl,checkedAt:new Date().toISOString()});
 } catch { return NextResponse.json({error:"Could not reach Context.dev. Try again."},{status:502}); }
}

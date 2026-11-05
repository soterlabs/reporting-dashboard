import { NextResponse } from "next/server";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const q=new URL(request.url).searchParams;
  if(q.get("prime")!=="spark" || !/^2026-(0[1-9]|1[0-2])$/.test(q.get("month") || "") || !/^[a-f0-9]{64}$/.test(q.get("revision") || "")) return NextResponse.json({error:"Invalid cash-flow evidence selection"},{status:400});
  const offset=Number(q.get("offset") || "0"),limit=Number(q.get("limit") || "100");
  if(!Number.isSafeInteger(offset) || offset<0 || !Number.isSafeInteger(limit) || limit<1 || limit>1000) return NextResponse.json({error:"Invalid evidence pagination"},{status:400});
  const params=new URLSearchParams({prime:"spark",month:q.get("month")!,revision:q.get("revision")!,offset:String(offset),limit:String(limit)});
  if(q.has("line"))params.set("line",q.get("line")!);
  const base=(process.env.REPORTING_API_URL || "https://settle-api-production.up.railway.app").replace(/\/+$/,"");
  try{
    const response=await fetch(`${base}/v3/reporting/cash-flow/events?${params}`,{cache:"no-store",signal:AbortSignal.timeout(12000)});
    if(!response.ok)return NextResponse.json({error:"Cash-flow evidence unavailable"},{status:[404,422].includes(response.status)?response.status:503});
    const doc=await response.json();
    if(doc.schema_version!=="cash-flow-events.v1" || doc.prime!=="spark" || doc.month!==q.get("month") || doc.revision!==q.get("revision") || !Array.isArray(doc.events) || doc.events.length>limit)throw new Error("Evidence identity differs");
    return NextResponse.json(doc,{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"Cash-flow evidence unavailable"},{status:503});}
}

import { NextResponse } from "next/server";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const q=new URL(request.url).searchParams;
  if(q.get("prime")!=="spark" || !/^2026-(0[1-9]|1[0-2])$/.test(q.get("month") || "") || !/^[a-f0-9]{64}$/.test(q.get("revision") || ""))return NextResponse.json({error:"Invalid cash-flow balance selection"},{status:400});
  const params=new URLSearchParams({prime:"spark",month:q.get("month")!,revision:q.get("revision")!});
  const base=(process.env.REPORTING_API_URL || "https://settle-api-production.up.railway.app").replace(/\/+$/,"");
  try{
    const response=await fetch(`${base}/v3/reporting/cash-flow/balances?${params}`,{cache:"no-store",signal:AbortSignal.timeout(12000)});
    if(!response.ok)return NextResponse.json({error:"Cash-flow balances unavailable"},{status:response.status===404?404:503});
    const doc=await response.json();
    if(doc.schema_version!=="cash-flow-balances.v1" || doc.prime!=="spark" || doc.month!==q.get("month") || doc.revision!==q.get("revision") || !/^[a-f0-9]{64}$/.test(doc.document_hash || "") || !doc.balance_witnesses || typeof doc.balance_witnesses!=="object")throw new Error("Balance identity differs");
    return NextResponse.json(doc,{headers:{"Cache-Control":"no-store"}});
  }catch{return NextResponse.json({error:"Cash-flow balances unavailable"},{status:503});}
}

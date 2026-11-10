import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {metricAmount,type Metric} from "./financial.ts";
import type {Prime} from "./reporting.ts";
import type {StatementLine} from "./prime-reports.ts";
const D=Decimal.clone({precision:100,rounding:Decimal.ROUND_HALF_EVEN});
export interface BalanceSheetReport {
 schema_version:"balance-sheet.v1";policy_version:"spark-balance-sheet.closing-stocks.v1";prime:"spark";year:number;as_of:string;
 periods:{key:string;state:"complete"|"partial"|"future";expected_cutoff:string|null;actual_cutoff:string|null;stale:boolean;sources:Record<string,string>}[];
 lines:{id:string;label:string;parent:string|null;depth:number;kind:NonNullable<StatementLine["kind"]>|null;aggregation:"last";components:{id:string;sign:number}[];values:Record<string,Metric>;total:Metric}[];
 source_manifest:Record<string,{kind:string;revision:string;cutoff:string;source_hash:string}>;
 selection:string;report_hash:string;total_label:"Latest";methodology:Record<string,string>;
}
function canonical(v:unknown):string {
 if(Array.isArray(v))return `[${v.map(canonical).join(", ")}]`;
 if(v&&typeof v==="object")return `{${Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>`${canonical(k)}: ${canonical(x)}`).join(", ")}}`;
 return JSON.stringify(v).replace(/[\u007f-\uffff]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,"0")}`);
}
const requireValue=(v:unknown,message:string)=>{if(!v)throw Error(`Invalid balance sheet: ${message}`);};
export const balanceSheetHash=(value:unknown)=>createHash("sha256").update(canonical(value)).digest("hex");
const hash=(v:unknown)=>typeof v==="string"&&/^[a-f0-9]{64}$/.test(v);
function metric(c:Metric){
 requireValue(c&&["available","partial","unavailable","future"].includes(c.status)&&c.unit==="USD"&&c.recognition==="closing_balance"&&["supported","estimate"].includes(c.quality||"")&&Array.isArray(c.source_refs),"metric metadata");
 for(const v of [c.value,c.known_value])requireValue(v===null||typeof v==="string"&&/^-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(v)&&new D(v).isFinite(),"decimal");
 requireValue(c.status==="available" ? c.value!==null&&c.known_value===null : c.status==="partial" ? c.value===null&&c.known_value!==null : c.value===null&&c.known_value===null,"metric coverage");
}
export function validateBalanceSheet(value:unknown,prime:Prime,year:number,revision?:string):BalanceSheetReport {
 const doc=value as BalanceSheetReport;
 requireValue(doc?.schema_version==="balance-sheet.v1"&&doc.policy_version==="spark-balance-sheet.closing-stocks.v1"&&doc.prime===prime&&prime==="spark"&&doc.year===year&&year===2026,"identity");
 const {report_hash:reportHash,...body}=doc;
 requireValue(hash(reportHash)&&balanceSheetHash(body)===reportHash,"report hash");
 requireValue(/^2026-\d\d-\d\d$/.test(doc.as_of)&&new Date(doc.as_of+"T00:00:00Z").toISOString().slice(0,10)===doc.as_of,"date");
 const selected=JSON.parse(Buffer.from(doc.selection,"base64url").toString());
 requireValue((!revision||revision===doc.selection)&&selected.policy_version===doc.policy_version&&selected.prime===prime&&selected.year===year&&selected.as_of===doc.as_of&&Array.isArray(selected.months)&&selected.months.length===12,"selection");
 requireValue(doc.total_label==="Latest"&&doc.periods?.length===12&&Array.isArray(doc.lines)&&doc.lines.length>0&&doc.source_manifest,"structure");
 const byId=new Map(doc.lines.map(r=>[r.id,r]));requireValue(byId.size===doc.lines.length,"duplicate rows");
 for(const id of ["assets","liabilities","equity","total_assets","total_liabilities","total_equity","liabilities_equity","cash","savings","sky_debt","contributed_capital","current_earnings"])requireValue(byId.has(id),"required rows");
 doc.periods.forEach((p,i)=>{
  const key=`${year}-${String(i+1).padStart(2,"0")}`,last=new Date(Date.UTC(year,i+1,0)).toISOString().slice(0,10);
  const state=key+"-01">doc.as_of?"future":last>doc.as_of?"partial":"complete";
  const expected=state==="future"?null:state==="partial"?doc.as_of:last;
  requireValue(p.key===key&&p.state===state&&p.expected_cutoff===expected,"period calendar");
  const s=selected.months[i];
  requireValue(p.actual_cutoff===(s?.cutoff??null)&&p.stale===Boolean(p.actual_cutoff&&expected&&p.actual_cutoff<expected),"cutoff");
  if(s)requireValue(Object.keys(s).sort().join() === "cash,components,cutoff,venues"&&expected&&/^2026-\d\d-\d\d$/.test(s.cutoff)&&new Date(s.cutoff+"T00:00:00Z").toISOString().slice(0,10)===s.cutoff&&s.cutoff.startsWith(key+"-")&&s.cutoff<=expected&&(state!=="complete"||s.cutoff===last)&&[s.cash,s.venues,s.components].some(Boolean),"source cutoff");
  const refs=Object.entries(s||{}).filter(([k,v])=>k!=="cutoff"&&v).map(([k,v])=>`${k}:${v}`).sort();
  requireValue(Object.keys(p.sources).every(k=>["cash","venues","components"].includes(k))&&Object.values(p.sources).sort().join()===refs.join(),"period sources");
  for(const [kind,ref] of Object.entries(p.sources)){
   const source=doc.source_manifest[ref];requireValue(source&&source.kind===kind&&hash(source.revision)&&ref===kind+":"+source.revision&&hash(source.source_hash)&&source.cutoff===p.actual_cutoff,"source identity");
  }
 });
 const used=new Set(doc.periods.flatMap(p=>Object.values(p.sources)));
 requireValue(Object.keys(doc.source_manifest).length===used.size&&Object.keys(doc.source_manifest).every(k=>used.has(k)),"source perimeter");
 const latest=doc.periods.filter(p=>p.state!=="future").at(-1)!;
 const seen=new Set<string>();
 for(const row of doc.lines){
  requireValue(typeof row.label==="string"&&Number.isInteger(row.depth)&&row.depth>=0&&row.aggregation==="last"&&[null,"section","subtotal","total"].includes(row.kind),"row metadata");
  requireValue(row.parent===null ? row.depth===0 : seen.has(row.parent)&&row.depth===byId.get(row.parent)!.depth+1,"hierarchy");seen.add(row.id);
  requireValue(Array.isArray(row.components)&&new Set(row.components.map(c=>c.id)).size===row.components.length&&row.components.every(c=>byId.has(c.id)&&c.id!==row.id&&c.sign===1),"components");
  const sectionForTotal:Record<string,string>={total_assets:"assets",total_liabilities:"liabilities",total_equity:"equity"};
  const expectedComponents=row.kind==="subtotal"?doc.lines.filter(r=>r.parent===row.id).map(r=>r.id):sectionForTotal[row.id]?doc.lines.filter(r=>r.parent===sectionForTotal[row.id]).map(r=>r.id):row.id==="liabilities_equity"?["total_liabilities","total_equity"]:[];
  requireValue(row.components.map(c=>c.id).join()===expectedComponents.join(),"component perimeter");
  for(const p of doc.periods){
   const cell=row.values[p.key];metric(cell);requireValue((cell.status==="future")===(p.state==="future"),"future values");
   requireValue(cell.source_refs!.every(ref=>used.has(ref)&&doc.source_manifest[ref].cutoff<=(p.expected_cutoff||"")),"amount provenance");
   requireValue(metricAmount(cell)===null||cell.source_refs!.length>0,"unbacked value");
   if (!["current_earnings","total_equity","liabilities_equity"].includes(row.id)) requireValue(cell.source_refs!.every(ref=>doc.source_manifest[ref].cutoff===p.actual_cutoff),"mixed closing cutoffs");
   if(row.kind==="section")requireValue(metricAmount(cell)===null&&row.components.length===0,"section amounts");
   if(row.components.length&&p.state!=="future"){
    const children=row.components.map(c=>byId.get(c.id)!.values[p.key]),known=children.filter(c=>metricAmount(c)!==null);
    const status=children.every(c=>c.status==="available")?"available":known.length?"partial":"unavailable";
    const expected=known.length?known.reduce((s,c)=>s.plus(metricAmount(c)!),new D(0)):null;
    requireValue(cell.status===status&&(expected===null?metricAmount(cell)===null:metricAmount(cell)!==null&&expected.eq(metricAmount(cell)!)),"subtotal");
   }
  }
  metric(row.total);requireValue(canonical(row.total)===canonical(row.values[latest.key]),"latest stock must not be summed");
 }
 return doc;
}

import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import type { ExpenseSnapshot } from "./spark-expenses.ts";
import { validateExpenseSnapshot } from "./spark-expenses.ts";

export type MarginMetric = { value: string | null; status: string; reason: string | null; unit?: string; known_value?: string | null };
export interface MarginMonth {
  month: string; period: {state:string};
  metrics: Record<string,MarginMetric>;
  numerators: Record<string,MarginMetric>;
  denominators: Record<string,MarginMetric>;
  expense_basis: string | null;
  allocation_slice: {status:string; reason:string; included_venues:string[]; excluded_venues:{venue:string;reason:string}[];
    metrics:Record<string,MarginMetric>; reconciliation?:Record<string,unknown>};
}
export interface MarginReport {
  schema_version:string; policy_version:string; prime:"spark"; year:number; as_of:string;
  report_hash:string; statement_report_hash:string; statement_selection:string; selection:string;
  expense_revision:string; months:MarginMonth[]; provisional:true;
}
export const marginLabels: Record<string,string> = {
  allocation_yield:"Allocation yield", cost_on_assets:"Funding cost / assets", funding_rate:"Average funding rate",
  nis:"NIS — investment spread", nim:"NIM — net investment margin", nrm_before_incentives:"NRM before user incentives",
  nrm_after_incentives:"NRM after user incentives", nm:"NM — net return after operating expenses",
};
const requireValue=(v:unknown)=>{if(!v)throw new Error("Invalid margins publication");};
function metric(v:MarginMetric){
 requireValue(v && ["available","unavailable","partial","not_applicable","future"].includes(v.status));
 requireValue((v.status==="available") === (v.value!==null));
 if(v.value!==null)requireValue(typeof v.value==="string" && new Decimal(v.value).isFinite());
 if(v.known_value!==undefined && v.known_value!==null)requireValue(typeof v.known_value==="string" && new Decimal(v.known_value).isFinite());
}
export function validateMargins(input:unknown,prime:string,year:number,revision?:string):MarginReport{
 const v=input as MarginReport;
 if(revision)requireValue(v?.selection===revision);
 requireValue(v?.schema_version==="reporting-margins.v1" && v.policy_version==="spark-reporting-margins.v1" && v.prime===prime && prime==="spark" && v.year===year && v.provisional===true);
 requireValue(typeof v.selection==="string" && v.selection.length>0 && /^\d{4}-\d\d-\d\d$/.test(v.as_of));
 for(const hash of [v.report_hash,v.statement_report_hash,v.expense_revision])requireValue(/^[a-f0-9]{64}$/.test(hash));
 requireValue(Array.isArray(v.months) && v.months.length===12);
 v.months.forEach((m,i)=>{
  requireValue(m.month===`${year}-${String(i+1).padStart(2,"0")}`);
  for(const key of Object.keys(marginLabels)){requireValue(key in m.metrics);metric(m.metrics[key]);}
  for(const cell of Object.values(m.numerators))metric(cell);
  for(const cell of Object.values(m.denominators))metric(cell);
  requireValue(Array.isArray(m.allocation_slice.included_venues) && Array.isArray(m.allocation_slice.excluded_venues));
  for(const cell of Object.values(m.allocation_slice.metrics))metric(cell);
 });
 return v;
}
export function validateSharedExpenses(v:unknown){
 const x=v as {schema_version:string;revision_id:string;snapshot:ExpenseSnapshot};
 requireValue(x?.schema_version==="reporting-expenses.v1" && /^[a-f0-9]{64}$/.test(x.revision_id));
 const snapshot=validateExpenseSnapshot(x.snapshot);
 requireValue(snapshot.prime==="spark");
 requireValue(createHash("sha256").update(JSON.stringify(snapshot)).digest("hex")===x.revision_id);
 return {...x,snapshot};
}
export function marginText(cell:MarginMetric|undefined,spread=false):string{
 if(!cell || cell.status!=="available" || cell.value===null)return cell?.status==="not_applicable" ? "N/A" : "TBD";
 return `${new Decimal(cell.value).times(100).toFixed(4)}${spread ? " pp" : "%"}`;
}

export function hasPortfolioMargins(report:MarginReport):boolean {
 return report.months.some(m=>m.period.state!=="future" && Object.values(m.metrics).some(c=>c.status==="available"));
}

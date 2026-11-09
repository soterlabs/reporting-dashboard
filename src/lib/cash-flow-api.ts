import { statementDisplayLabel } from "./statement-labels.ts";
// Server-side validation of the stored cash-flow API contract. Workbook values
// are not substituted when the API is absent; legacy exports remain separate.
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { metricAmount, type Metric } from "./financial.ts";
import type { Prime } from "./reporting.ts";
import type { StatementLine } from "./prime-reports.ts";

export interface CashFlowReport {
  schema_version: "cash-flow.v1";
  policy_version: "spark-cash-flow.events.v1" | "spark-cash-flow.events.v2";
  prime: "spark";
  year: number;
  as_of: string;
  selection: string;
  report_hash: string;
  periods: { key: string; state: "complete" | "partial" | "future"; expected_cutoff: string | null; actual_cutoff: string | null; revision: string | null; stale: boolean }[];
  lines: { id: string; label: string; parent: string | null; depth: number; kind: StatementLine["kind"] | null; check: boolean; aggregation: "sum" | "first" | "last"; values: Record<string, Metric>; total: Metric }[];
  source_manifest: Record<string, { cutoff: string; computed_at: string; document_hash: string; evidence_hash: string; code_version: string; configuration_revision: string }>;
  monthly_coverage: Record<string, { missing_chains: string[]; partial_chains?: string[]; token_registry_gaps?: string[]; classification_complete?: boolean; unclassified_events: number; savings_failures: Record<string, unknown>; allocation_basis_failures?: Record<string, unknown> } | null>;
  methodology: Record<string, unknown>;
  source_note: string;
}
const D = Decimal.clone({ precision: 150 });
const hash = /^[a-f0-9]{64}$/;
const decimal = /^-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/;
const requireValue = (ok: unknown, message: string) => { if (!ok) throw new Error(`Invalid cash-flow report: ${message}`); };
// Python's canonical digest uses sorted keys, ASCII strings and default JSON
// separators. Preserve that exact representation when validating the hash.
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(", ")}]`;
  if (v && typeof v === "object") return `{${Object.entries(v).sort(([a],[b])=>a < b ? -1 : a > b ? 1 : 0).map(([k,x])=>`${canonical(k)}: ${canonical(x)}`).join(", ")}}`;
  return JSON.stringify(v).replace(/[\u007f-\uffff]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,"0")}`);
}
function checkMetric(cell: Metric, future = false) {
  requireValue(cell && ["available","partial","unavailable","future"].includes(cell.status) && cell.unit === "USD" && ["supported","estimate"].includes(cell.quality || "") && typeof cell.recognition === "string" && typeof cell.basis === "string" && Array.isArray(cell.source_paths),"metric metadata");
  for (const v of [cell.value, cell.known_value]) requireValue(v === null || typeof v === "string" && decimal.test(v) && new D(v).isFinite(),"decimal");
  requireValue(cell.status !== "available" || cell.value !== null && cell.known_value === null,"available metric");
  requireValue(cell.status !== "partial" || cell.value === null && cell.known_value !== null,"partial metric");
  requireValue(!["unavailable","future"].includes(cell.status) || cell.value === null && cell.known_value === null,"missing value");
  requireValue(!future || cell.status === "future","future metric");
}
function sum(cells: Metric[]) {
  const known = cells.filter(c=>metricAmount(c)!==null);
  return { amount: known.length ? known.reduce((s,c)=>s.plus(metricAmount(c)!),new D(0)).toString() : null, status: cells.length && cells.every(c=>c.status==="available") ? "available" : known.length ? "partial" : "unavailable" };
}
function checkSum(cell: Metric, cells: Metric[]) {
  const expected = sum(cells),actual=metricAmount(cell);
  requireValue(cell.status===expected.status && (actual===null ? expected.amount===null : expected.amount!==null && new D(actual).equals(expected.amount)),"subtotal or coverage");
}
const children: Record<string,string[]> = {
  "non-cash":["issuer-rewards-noncash","token-incentives","contributor-spk","non-stable-gains","non-stable-transfers","other-non-cash"], receivables:["earned-not-received","sky-allocation-receipts","sky-demand-receipts","external-receipts"], payables:["expenses-booked","expenses-paid","savings-interest-paid"],
  "net-operating":["net-income","non-cash","receivables","payables"],"net-investing":["allocation-changes","investments","sky-direct-deployments","treasury-disposals"],"net-financing":["usds-drawn","deposits","sky-contributions","buybacks"],"net-cash-change":["net-operating","net-investing","net-financing"],
};
export function validateCashFlow(value: unknown, prime: Prime, year: number, revision?: string): CashFlowReport {
  const doc=value as CashFlowReport;
  requireValue(doc?.schema_version==="cash-flow.v1" && ["spark-cash-flow.events.v1","spark-cash-flow.events.v2"].includes(doc.policy_version) && doc.prime===prime && prime==="spark" && doc.year===year && year===2026,"identity");
  requireValue(hash.test(doc.report_hash) && typeof doc.selection==="string" && (!revision || doc.selection===revision),"selection");
  const {report_hash: reportHash,...body}=doc;
  requireValue(createHash("sha256").update(canonical(body)).digest("hex")===reportHash,"report hash");
  const selected=JSON.parse(Buffer.from(doc.selection,"base64url").toString());
  requireValue(selected.prime===prime && selected.year===year && selected.as_of===doc.as_of && selected.policy_version===doc.policy_version && Array.isArray(selected.revisions) && selected.revisions.length===12,"selected perimeter");
  requireValue(/^2026-(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(doc.as_of) && new Date(doc.as_of+"T00:00:00Z").toISOString().slice(0,10)===doc.as_of,"as-of date");
  requireValue(Object.keys(selected).sort().join(",")==="as_of,policy_version,prime,revisions,year" && selected.revisions.every((v:unknown)=>v===null || typeof v==="string" && hash.test(v)),"selection structure");
  requireValue(doc.methodology?.opening_msc_receivable==="7071339","opening MSC receivable");
  requireValue(Array.isArray(doc.periods) && doc.periods.length===12 && Array.isArray(doc.lines) && doc.source_manifest && doc.monthly_coverage,"structure");
  const byId=new Map(doc.lines.map(r=>[r.id,r]));
  requireValue(byId.size===doc.lines.length && Object.entries(children).every(([p,cs])=>byId.has(p) && cs.every(id=>byId.has(id) || ["issuer-rewards-noncash","contributor-spk","savings-interest-paid","sky-direct-deployments","treasury-disposals"].includes(id))),"line identities");
  doc.periods.forEach((p,i)=>{
    requireValue(p.key===`${year}-${String(i+1).padStart(2,"0")}` && p.revision===selected.revisions[i] && ["complete","partial","future"].includes(p.state),"period identity");
    const first=p.key+"-01",last=new Date(Date.UTC(year,i+1,0)).toISOString().slice(0,10);
    const expectedState=first>doc.as_of ? "future" : last>doc.as_of ? "partial" : "complete";
    requireValue(p.state===expectedState && p.expected_cutoff===(expectedState==="future" ? null : expectedState==="partial" ? doc.as_of : last) && p.stale===Boolean(p.actual_cutoff && p.expected_cutoff && p.actual_cutoff<p.expected_cutoff),"period calendar");
    if (p.revision) {
      const source=doc.source_manifest[p.revision];
      requireValue(hash.test(p.revision) && source && source.cutoff===p.actual_cutoff && source.cutoff.slice(0,7)===p.key && p.expected_cutoff && source.cutoff<=p.expected_cutoff && hash.test(source.document_hash) && hash.test(source.evidence_hash),"period source");
      requireValue(doc.monthly_coverage[p.key] && Array.isArray(doc.monthly_coverage[p.key]!.missing_chains),"monthly coverage");
    } else requireValue(p.actual_cutoff===null && doc.monthly_coverage[p.key]===null,"absent source");
    if(p.state==="future") requireValue(!p.revision && p.expected_cutoff===null,"future publication");
    if(p.state==="complete")requireValue(p.expected_cutoff===new Date(Date.UTC(year,i+1,0)).toISOString().slice(0,10) && (!p.actual_cutoff || p.actual_cutoff===p.expected_cutoff),"month-end cutoff");
  });
  requireValue(Object.keys(doc.source_manifest).sort().join(",") === [...new Set(doc.periods.map(p=>p.revision).filter(Boolean))].sort().join(","),"source manifest perimeter");
  for(const row of doc.lines){
    requireValue(typeof row.label==="string" && Number.isInteger(row.depth) && row.depth>=0 && typeof row.check==="boolean" && ["sum","first","last"].includes(row.aggregation),"row metadata");
    if(row.parent){const parent=byId.get(row.parent);requireValue(parent && parent.depth+1===row.depth,"hierarchy");}
    requireValue(Object.keys(row.values).length===12,"monthly values");
    for(const p of doc.periods){
      const cell=row.values[p.key];checkMetric(cell,p.state==="future");
      if(p.stale && metricAmount(cell)!==null && !["cumulative-gap","msc-receivable"].includes(row.id))requireValue(cell.status==="partial","stale coverage");
      if(metricAmount(cell)!==null && !["cumulative-gap","msc-receivable"].includes(row.id))requireValue(p.revision && cell.source_ref===p.revision,"amount source");
    }
    checkMetric(row.total);
    if(!["cumulative-gap","msc-receivable"].includes(row.id)){
      const elapsed=doc.periods.filter(p=>p.state!=="future");
      const chosen=row.aggregation==="first" ? elapsed.slice(0,1) : row.aggregation==="last" ? elapsed.slice(-1) : elapsed;
      checkSum(row.total,chosen.map(p=>row.values[p.key]));
    }
  }
  for(const [parent,ids] of Object.entries(children)) for(const p of doc.periods.filter(p=>p.state!=="future")) checkSum(byId.get(parent)!.values[p.key],ids.filter(id=>byId.has(id)).map(id=>byId.get(id)!.values[p.key]));
  for(const [id,opening,parts] of [
    ["cumulative-gap","0",[["reconciliation-gap",1]]],
    ["msc-receivable","7071339",[["earned-not-received",-1],["sky-allocation-receipts",-1],["sky-demand-receipts",-1]]],
  ] as const){
    const row=byId.get(id);requireValue(row,"cumulative row");
    let running={value:opening,known_value:null,status:"available"} as Metric;
    for(const p of doc.periods.filter(p=>p.state!=="future")){
      const terms=[running,...parts.map(([part,sign])=>{
        const cell=byId.get(part)!.values[p.key];
        return {...cell,value:cell.value===null ? null : new D(cell.value).mul(sign).toString(),known_value:cell.known_value===null ? null : new D(cell.known_value).mul(sign).toString()};
      })];
      checkSum(row!.values[p.key],terms);running=row!.values[p.key];
    }
    checkSum(row!.total,[running]);
  }
  return doc;
}

export function cashFlowApiCsv(doc: CashFlowReport): unknown[][] {
  return [["Line item",...doc.periods.map(p=>p.key),"YTD","Row ID","Parent row ID","Depth","Section","Report hash","Selection","Monthly coverage","Sources","Monthly quality","Monthly source references"],
    ...doc.lines.map(row=>[statementDisplayLabel(row.id,row.label),...doc.periods.map(p=>row.kind==="section" ? "" : p.state==="future" ? "—" : metricAmount(row.values[p.key]) ?? "TBD"),row.kind==="section" ? "" : metricAmount(row.total) ?? "TBD",row.id,row.parent || "",row.depth,row.check ? "Reconciliation" : "Statement",doc.report_hash,doc.selection,JSON.stringify(Object.fromEntries(doc.periods.map(p=>[p.key,row.values[p.key].status]))),JSON.stringify(doc.source_manifest),JSON.stringify(Object.fromEntries(doc.periods.map(p=>[p.key,row.values[p.key].quality]))),JSON.stringify(Object.fromEntries(doc.periods.map(p=>[p.key,row.values[p.key].source_ref || null])))])];
}

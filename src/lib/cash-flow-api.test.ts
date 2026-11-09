import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { validateCashFlow,cashFlowApiCsv,validateCashSubtotal } from "./cash-flow-api.ts";
import { metricAmount } from "./financial.ts";
import { numberConfidence } from "./number-confidence.ts";
const raw=()=>JSON.parse(readFileSync(new URL("./fixtures/spark-cash-flow-api.json",import.meta.url),"utf8"));
// Reproduce the Python canonical digest when checking semantic tampering beyond
// the envelope hash (the network reader must validate both).
function canonical(v:unknown):string{
 if(Array.isArray(v))return `[${v.map(canonical).join(", ")}]`;
 if(v&&typeof v==="object")return `{${Object.entries(v).sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,x])=>`${canonical(k)}: ${canonical(x)}`).join(", ")}}`;
 return JSON.stringify(v).replace(/[\u007f-\uffff]/g,c=>`\\u${c.charCodeAt(0).toString(16).padStart(4,"0")}`);
}
function rehash(doc:ReturnType<typeof raw>){const {report_hash:_,...body}=doc;doc.report_hash=createHash("sha256").update(canonical(body)).digest("hex");return doc;}
test("cash-flow API contract validates actual October facts and independently pinned hashes",()=>{
 const r=validateCashFlow(raw(),"spark",2026);
 assert.equal(metricAmount(r.lines.find(r=>r.id==="sky-demand-receipts")!.values["2026-10"]),"809350");
 assert.equal(numberConfidence(metricAmount(r.lines.find(r=>r.id==="sky-demand-receipts")!.values["2026-10"]),r.lines.find(r=>r.id==="sky-demand-receipts")!.values["2026-10"]).tone,"cash");
 assert.equal(validateCashFlow(raw(),"spark",2026,r.selection).selection,r.selection);
 assert.throws(()=>validateCashFlow(raw(),"grove",2026),/identity/);
 assert.throws(()=>validateCashFlow(raw(),"spark",2025),/identity/);
 assert.throws(()=>validateCashFlow(raw(),"spark",2026,"substituted"),/selection/);
});
test("cash-flow figures cannot be substituted, cross-month sourced or silently rounded",()=>{
 const d=raw();d.lines.find((r:{id:string})=>r.id==="buybacks").values["2026-10"].value="-1";
 assert.throws(()=>validateCashFlow(d,"spark",2026),/hash/);
 const changed=raw();changed.periods[9].actual_cutoff="2026-10-27";
 assert.throws(()=>validateCashFlow(rehash(changed),"spark",2026),/source|cutoff|calendar/);
 const wrong=raw();wrong.lines.find((r:{id:string})=>r.id==="buybacks").values["2026-10"].source_ref="f".repeat(64);
 assert.throws(()=>validateCashFlow(rehash(wrong),"spark",2026),/source/);
});
test("complete and partial cash flow totals are checked beyond the report hash",()=>{
 const d=raw(),line=d.lines.find((r:{id:string})=>r.id==="net-financing");line.values["2026-10"].known_value="999";
 assert.throws(()=>validateCashFlow(rehash(d),"spark",2026),/subtotal/);
 const bad=raw();bad.lines.find((r:{id:string})=>r.id==="buybacks").total.known_value="0";
 assert.throws(()=>validateCashFlow(rehash(bad),"spark",2026),/subtotal/);
});
test("cash-flow CSV uses API values, source selection, exact precision and future/missing distinctions",()=>{
 const doc=validateCashFlow(raw(),"spark",2026),csv=cashFlowApiCsv(doc),h=csv[0];
 const row=csv.find(r=>r[h.indexOf("Row ID")]==="buybacks")!;
 assert.equal(row[10],metricAmount(doc.lines.find(r=>r.id==="buybacks")!.values["2026-10"]));
 assert.equal(row[11],"TBD");assert.equal(row[12],"—");assert.equal(row[h.indexOf("Selection")],doc.selection);
 assert.ok(!h.includes("Workbook total (control)"));assert.ok(h.includes("Monthly quality"));
 const netCash=csv.find(r=>r[h.indexOf("Row ID")]==="net-cash-change")!;
 assert.equal(netCash[0],"Net increase in cash and stablecoin balances");
 assert.equal(netCash[10],metricAmount(doc.lines.find(r=>r.id==="net-cash-change")!.values["2026-10"]));
 assert.equal(doc.lines.find(r=>r.id==="net-cash-change")!.label,"Net increase (decrease) in cash and stablecoin balances");
});
test("cumulative reconciliation and MSC balances cannot bypass arithmetic validation",()=>{
 for(const id of ["cumulative-gap","msc-receivable"]){
  const doc=raw(),row=doc.lines.find((r:{id:string})=>r.id===id);row.values["2026-10"].known_value="123";
  assert.throws(()=>validateCashFlow(rehash(doc),"spark",2026),/subtotal/);
 }
 const doc=raw();doc.methodology.opening_msc_receivable="0";
 assert.throws(()=>validateCashFlow(rehash(doc),"spark",2026),/opening MSC/);
});


test("reviewed cash selections retain their policy and reject a substituted legacy selection",()=>{
 const doc=raw();
 doc.policy_version="spark-cash-flow.events.v2";
 const selection=JSON.parse(Buffer.from(doc.selection,"base64url").toString());
 selection.policy_version=doc.policy_version;
 doc.selection=Buffer.from(JSON.stringify(selection)).toString("base64url");
 validateCashFlow(rehash(doc),"spark",2026,doc.selection);
 const stale=raw();stale.policy_version="spark-cash-flow.events.v2";
 assert.throws(()=>validateCashFlow(rehash(stale),"spark",2026),/selected perimeter/);
});


test("reviewed cash arithmetic accepts Python-rounded MTD accruals without tolerating changed amounts",()=>{
 const values=["434113.3333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333333", "-2000000.12345678901234567890123456789", "591191.6354774727593748501886562866644"];
 const expected="-974695.154645982919637495379244947892266666666666666666666666666666666666666666666666666666666666667";
 // Values/result calculated by the backend's 100-digit half-even Decimal sum.
 const metric=(value:string)=>({value,known_value:null,status:"available"} as Parameters<typeof validateCashSubtotal>[0]);
 validateCashSubtotal(metric(expected),values.map(metric),"spark-cash-flow.events.v2");
 assert.throws(()=>validateCashSubtotal(metric(expected),values.map(metric),"spark-cash-flow.events.v1"),/subtotal/);
 assert.throws(()=>validateCashSubtotal(metric(expected.replace(/.$/,"9")),values.map(metric),"spark-cash-flow.events.v2"),/subtotal/);
});

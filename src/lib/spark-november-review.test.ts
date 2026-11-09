import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import Decimal from "decimal.js";
import { metricAmount, validateStatement } from "./financial.ts";
import { withPrimeExpenses } from "./spark-expenses.ts";
const D=Decimal.clone({precision:150});
const read=(name:string)=>JSON.parse(gunzipSync(readFileSync(new URL(`./fixtures/${name}.json.gz`,import.meta.url))).toString());

test("reviewed ETH presentation removes principal FX while preserving Jan–Oct net revenue and source evidence",()=>{
 const before=validateStatement(read("spark-review-baseline"),"spark",2026);
 const after=validateStatement(read("spark-november-review"),"spark",2026);
 assert.equal(after.policy_version,"prime-management.spark-reviewed.v3.11");
 for(const period of after.periods.slice(0,10)){
  const amount=(r:typeof after,id:string)=>metricAmount(r.lines.find(l=>l.id===id)!.values[period.key])!;
  assert.ok(new D(amount(after,"statement.net_revenue")).minus(amount(before,"statement.net_revenue")).abs().lte("1e-18"));
 }
 const hidden=new Set(["gains.sparklend_nonstable","funding.savings.revaluation","rewards.unattributed_sparklend_receipts","statement.family.other_reviewed_vaults"]);
 assert.ok(after.statement_rows!.every(row=>!hidden.has(row.metric_id || "")));
 const ids=new Set(after.statement_rows!.map(row=>row.id));
 assert.ok(after.statement_rows!.every(row=>row.parent===null || ids.has(row.parent)));
 assert.ok(after.lines.find(l=>l.id==="funding.savings")!.components!.every(c=>c.id!=="funding.savings.revaluation"));
 assert.ok(after.lines.some(l=>l.id==="revaluation.savings_liabilities")); // Audit evidence retained.
});

test("grant-date SPK compensation feeds expenses and net income once; MTD is prorated and futures stay blank",()=>{
 const original=validateStatement(read("spark-review-baseline"),"spark",2026);
 const reviewed=validateStatement(read("spark-november-review"),"spark",2026);
 const before=withPrimeExpenses("spark",2026,original,undefined,undefined,undefined,"2026-10-31")!;
 const after=withPrimeExpenses("spark",2026,reviewed,undefined,undefined,undefined,"2026-10-31")!;
 const amount=(r:typeof after,id:string,m:string)=>metricAmount(r.lines.find(l=>l.id===id)!.values[m]);
 for(let n=1;n<=10;n++){
  const month=`2026-${String(n).padStart(2,"0")}`;
  assert.equal(amount(after,"expenses.compensation.spk",month),"1627925");
  assert.ok(new D(amount(after,"expenses.total",month)!).minus(amount(before,"expenses.total",month)!).eq("1627925"));
  assert.ok(new D(amount(before,"dashboard.net_income",month)!).minus(amount(after,"dashboard.net_income",month)!).minus("1627925").abs().lte("1e-18"));
 }
 const comp=reviewed.lines.find(l=>l.id==="expenses.compensation.spk")!;
 const days=Number(reviewed.as_of.slice(-2));
 assert.ok(new D(metricAmount(comp.values["2026-11"])!).minus(new D("1627925").times(days).div(30)).abs().lte("1e-18"));
 assert.equal(comp.values["2026-12"].status,"future");
 assert.equal(metricAmount(after.lines.find(l=>l.id===comp.id)!.total),"16279250");
 assert.equal(amount(after,"dashboard.net_income","2026-11"),null);
});

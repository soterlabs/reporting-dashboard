import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import Decimal from "decimal.js";
import { validateStatement,metricAmount } from "./financial.ts";
import { statementLines,yearMonths } from "./prime-reports.ts";
import { statementCsvRows } from "./financial-export.ts";
import { withPrimeExpenses } from "./spark-expenses.ts";
const D=Decimal.clone({precision:120});
const raw=()=>JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/spark-reconciled-v3.10.json.gz',import.meta.url))).toString('utf8'));
test("v3.10 supports actual PSM3 credits and a full gross asset/liability FX breakdown without changing net gains",()=>{
 const report=validateStatement(raw(),'spark',2026);const by=new Map(report.lines.map(r=>[r.id,r]));
 assert.equal(by.get('investment.psm3.susds')!.values['2026-04'].value,'1113906.99');
 assert.equal(by.get('investment.psm3.susds')!.values['2026-10'].status,'available');
 const m='2026-01';
 assert.equal(new D(metricAmount(by.get('revaluation.sparklend_assets')!.values[m])!).plus(metricAmount(by.get('revaluation.savings_liabilities')!.values[m])!).toString(),new D(metricAmount(by.get('gains.sparklend_nonstable')!.values[m])!).toString());
 const rows=statementLines('spark','individual',report);assert.equal(rows.find(r=>r.id==='revaluation.savings_liabilities')!.level,3);
 assert.equal(rows.find(r=>r.id==='investment.psm3.susds')!.parent,'investment.susds');
 assert.equal(by.get('investment.anchorage')!.values['2026-03'].value,'805479');
 assert.equal(by.get('investment.anchorage')!.values['2026-04'].value,'0');
});
test("MSC bridge shows differences but never claims absent summaries or unreviewed classifications reconcile",()=>{
 const r=validateStatement(raw(),'spark',2026),bridge=r.spark_msc_reconciliation!;
 assert.equal(bridge.find(b=>b.month==='2026-04')!.status,'review_required');
 const oct=bridge.find(b=>b.month==='2026-10')!;
 assert.equal(oct.status,'unavailable');assert.equal(metricAmount(oct.net_interest_difference),null);
 assert.equal(r.spark_fee_true_up_control!.added_to_reporting_income,false);
 for(const mutate of [
  (d:ReturnType<typeof raw>)=>d.spark_msc_reconciliation[0].net_interest_difference.value='0',
  (d:ReturnType<typeof raw>)=>d.spark_msc_reconciliation[0].quantitative_bridge_residual.value='100',
  (d:ReturnType<typeof raw>)=>d.spark_msc_reconciliation[0].status='reconciled',
  (d:ReturnType<typeof raw>)=>d.spark_msc_reconciliation[0].reporting_net_revenue.known_value='0',
  (d:ReturnType<typeof raw>)=>d.spark_fee_true_up_control.added_to_reporting_income=true,
 ]){const d=raw();mutate(d);assert.throws(()=>validateStatement(d,'spark',2026));}
});
test("new evidence remains prime/month scoped; expense composition and CSV keep new statement rows and source figures",()=>{
 const d=raw(),cell=d.lines.find((l:{id:string})=>l.id==='investment.anchorage').values['2026-03'];
 cell.source_ref=d.periods[3].reconciliation_revision;assert.throws(()=>validateStatement(d,'spark',2026));
 const api=validateStatement(raw(),'spark',2026),before=structuredClone(api);
 const composed=withPrimeExpenses('spark',2026,api,yearMonths(2026,new Date('2026-11-05T00:00:00Z')))!;
 assert.deepEqual(api,before);
 const csv=statementCsvRows('spark','individual',2026,'2026-10',yearMonths(2026,new Date('2026-11-05T00:00:00Z')),composed);
 assert.ok(csv.some(r=>r.includes('PSM3 sUSDS yield')));assert.ok(csv.some(r=>r.includes('Savings ETH liability revaluation')));
 assert.equal(composed.report_hash,api.report_hash);
});

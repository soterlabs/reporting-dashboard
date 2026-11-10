import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import test from "node:test";
import Decimal from "decimal.js";
import {validateBalanceSheet,balanceSheetHash,type BalanceSheetReport} from "./balance-sheet-api.ts";
import {balanceSheetRows,balanceSheetCsv} from "./balance-sheet.ts";
import {metricAmount} from "./financial.ts";
import {collapsedStatementGroups} from "./prime-reports.ts";
import {visibleStatementLines} from "./statement-layout.ts";
const fixture=():BalanceSheetReport=>JSON.parse(gunzipSync(readFileSync(new URL('./fixtures/spark-balance-sheet.json.gz',import.meta.url))).toString());
const rehash=(d:BalanceSheetReport)=>{const{report_hash,...body}=d;d.report_hash=balanceSheetHash(body);return d;};
test("real stored Spark stocks validate, stay separate from flows and preserve partial liabilities and equity",()=>{
 const d=validateBalanceSheet(fixture(),"spark",2026);
 const cell=(id:string)=>d.lines.find(r=>r.id===id)!.values['2026-10'];
 assert.equal(metricAmount(cell('cash')),'191121854.378284485168301137');
 assert.equal(metricAmount(cell('savings.S56')),'276753335.034242');
 assert.ok(new Decimal(metricAmount(cell('position.S1'))!).gt('1000000000'));
 assert.equal(cell('sky_debt').status,'unavailable');
 assert.equal(cell('opening_earnings').status,'unavailable');
 assert.equal(cell('total_assets').status,'partial');
 assert.equal(cell('total_equity').status,'partial');
 assert.equal(cell('reward_receivable.S68').value,'0');
 assert.ok(new Decimal(cell('reward_advance.S68').value!).gt('1800000'));
 assert.ok(!d.lines.some(r=>r.id==='position.S56'||r.id==='position.S26'));
});
test("latest stock exports use the most recent period rather than annual sums; section rows have no numbers",()=>{
 const d=validateBalanceSheet(fixture(),"spark",2026),csv=balanceSheetCsv(d),cash=d.lines.find(r=>r.id==='cash')!;
 assert.equal(csv[0][13],'Latest');
 assert.deepEqual(cash.total,cash.values['2026-11']);
 const row=csv.find(r=>r[14]==='cash')!;
 assert.equal(row[13],metricAmount(cash.values['2026-11']));
 assert.ok(csv.find(r=>r[14]==='assets')!.slice(1,14).every(v=>v===''));
 assert.ok(csv.find(r=>r[14]==='sky_debt')!.slice(1,12).every(v=>v==='TBD'));
 const layout=balanceSheetRows(d),collapsed=collapsedStatementGroups(layout),visible=visibleStatementLines(layout,collapsed);
 assert.ok(visible.some(r=>r.id==='allocations'));
 assert.ok(!visible.some(r=>r.id==='position.S1'));
});
test("hashes, cross-month amounts, invalid subtotal and summed stocks fail closed",()=>{
 const original=fixture();original.lines[1].total.value='123';
 assert.throws(()=>validateBalanceSheet(original,'spark',2026),/hash/);
 const total=fixture();total.lines.find(r=>r.id==='cash')!.total={...total.lines.find(r=>r.id==='cash')!.values['2026-10']};
 assert.throws(()=>validateBalanceSheet(rehash(total),'spark',2026),/latest stock/);
 const subtotal=fixture();subtotal.lines.find(r=>r.id==='total_assets')!.values['2026-10'].known_value='1';
 assert.throws(()=>validateBalanceSheet(rehash(subtotal),'spark',2026),/subtotal/);
 const duplicate=fixture();duplicate.lines.find(r=>r.id==='total_assets')!.components.push({id:'position.S1',sign:1});
 assert.throws(()=>validateBalanceSheet(rehash(duplicate),'spark',2026),/component perimeter/);
 const source=fixture();source.lines.find(r=>r.id==='position.S1')!.values['2026-10'].source_refs=Object.values(source.periods[0].sources);
 assert.throws(()=>validateBalanceSheet(rehash(source),'spark',2026),/closing cutoffs/);
});
test("all-zero known rows can be hidden; missing values and unknown ownership stay visible",()=>{
 const d=fixture();const row=d.lines.find(r=>r.id==='position.S1')!;
 for(const p of d.periods.filter(p=>p.state!=='future')) row.values[p.key]={...row.values[p.key],value:'0',known_value:null,status:'available'};
 assert.ok(!balanceSheetRows(d).some(r=>r.id===row.id));
 row.values['2026-01']={...row.values['2026-01'],value:null,status:'unavailable'};
 assert.ok(balanceSheetRows(d).some(r=>r.id===row.id));
 assert.ok(balanceSheetRows(d).some(r=>r.id==='sky_debt'));
});

test("a pinned cutoff needs a real source and canonical date",()=>{
 for(const mode of ['missing','date']){
  const d=fixture(),s=JSON.parse(Buffer.from(d.selection,'base64url').toString());
  if(mode==='missing'){
   Object.assign(s.months[0],{cash:null,venues:null,components:null});d.periods[0].sources={};
  }else{s.months[0].cutoff='20260131';d.periods[0].actual_cutoff='20260131';}
  d.selection=Buffer.from(JSON.stringify(s)).toString('base64url');
  assert.throws(()=>validateBalanceSheet(rehash(d),'spark',2026),/source cutoff/);
 }
});

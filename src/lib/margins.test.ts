import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {hasPortfolioMargins,validateMargins,marginText,validateSharedExpenses} from './margins.ts';
import {expenseSnapshotRevision,withPrimeExpenses} from './spark-expenses.ts';
import {validateStatement} from './financial.ts';
const fixture=()=>JSON.parse(readFileSync(new URL('./fixtures/margins.json',import.meta.url),'utf8'));
test('margins keep partial scope separate from overall returns',()=>{
 const doc=validateMargins(fixture(),'spark',2026),m=doc.months[8];
 assert.equal(marginText(m.metrics.nim),'TBD');
 assert.equal(marginText(m.allocation_slice.metrics.nim),'1.6000%');
 assert.equal(m.allocation_slice.reconciliation!.comparison_difference_after_financing_usd,'126444');
 assert.equal(marginText({value:'-0.0012',status:'available',reason:null},'nis'),'-12.00 bps');
});
test('reject another prime, missing month, nonfinite amount and fabricated available null',()=>{
 assert.throws(()=>validateMargins(fixture(),'grove',2026));
 const a=fixture();a.months.pop();assert.throws(()=>validateMargins(a,'spark',2026));
 const b=fixture();b.months[8].metrics.nim.status='available';assert.throws(()=>validateMargins(b,'spark',2026));
 const c=fixture();c.months[8].metrics.nim={value:'NaN',status:'available'};assert.throws(()=>validateMargins(c,'spark',2026));
});
test('shared backend expenses retain exact old snapshot and reject hash mismatch',()=>{
 const snapshot=JSON.parse(readFileSync(new URL('./data/spark-expenses-2026.v1.json',import.meta.url),'utf8'));
 const input={schema_version:'reporting-expenses.v1',revision_id:expenseSnapshotRevision,snapshot};
 assert.equal(validateSharedExpenses(input).revision_id,expenseSnapshotRevision);
 assert.throws(()=>validateSharedExpenses({...input,revision_id:'0'.repeat(64)}));
 const statement=validateStatement(JSON.parse(readFileSync(new URL('./fixtures/spark-history-v3.9.json',import.meta.url),'utf8')),'spark',2026);
 const legacy=withPrimeExpenses('spark',2026,statement);
 const remote=withPrimeExpenses('spark',2026,{...statement,shared_expense_input:input});
 assert.deepEqual(remote!.lines,legacy!.lines);
 assert.deepEqual(remote!.dashboard_composition,legacy!.dashboard_composition);
});

test('expense outage preserves income without silently composing local expenses',()=>{
 const statement=validateStatement(JSON.parse(readFileSync(new URL('./fixtures/spark-history-v3.9.json',import.meta.url),'utf8')),'spark',2026);
 const failed={...statement,shared_expense_error:'Unavailable'};
 const result=withPrimeExpenses('spark',2026,failed);
 assert.equal(result,failed);
 assert.equal(result?.dashboard_composition,undefined);
 assert.equal(result?.lines.find(l=>l.id==='statement.net_revenue'),statement.lines.find(l=>l.id==='statement.net_revenue'));
});

test('pinned margins reject a different source selection',()=>{
 const doc=fixture();
 assert.equal(validateMargins(doc,'spark',2026,doc.selection),doc);
 assert.throws(()=>validateMargins(doc,'spark',2026,'another-selection'));
});

test('portfolio availability responds to published metrics, excluding future months',()=>{
 const doc=fixture();
 assert.equal(hasPortfolioMargins(doc),false);
 doc.months[11].metrics.nim={value:"0.01",status:"available",reason:null};
 assert.equal(hasPortfolioMargins(doc),false);
 doc.months[8].metrics.nim={value:"0.01",status:"available",reason:null};
 assert.equal(hasPortfolioMargins(doc),true);
});


test('NIS and all subsequent margins use basis points without annualization',()=>{
 const cell={value:'0.001234',status:'available',reason:null};
 for(const key of ['nis','nim','nrm_before_incentives','nrm_after_incentives','nm']){
  assert.equal(marginText(cell,key),'12.34 bps');
  assert.equal(marginText({...cell,value:'0'},key),'0.00 bps');
  assert.equal(marginText({...cell,value:'-0.001234'},key),'-12.34 bps');
  assert.equal(marginText({...cell,value:null,status:'partial',known_value:'0.001234'},key),'TBD');
  assert.equal(marginText({...cell,value:null,status:'not_applicable'},key),'N/A');
 }
 for(const key of ['allocation_yield','cost_on_assets','funding_rate'])
  assert.equal(marginText(cell,key),'0.1234%');
 assert.equal(marginText({value:'0.000001',status:'available',reason:null},'nim'),'0.01 bps');
});

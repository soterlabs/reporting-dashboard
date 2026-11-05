import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconciliationChecks, compareCheck, type CheckInput } from "./cash-flow-reconciliation.ts";
import { validateCashFlow } from "./cash-flow-api.ts";
import { validateStatement } from "./financial.ts";
import { withPrimeExpenses } from "./spark-expenses.ts";
import { PRIMES } from "./reporting.ts";
import { yearMonths } from "./prime-reports.ts";
const raw=()=>JSON.parse(readFileSync(new URL("./fixtures/spark-cash-flow-api.json",import.meta.url),"utf8"));
const report=()=>validateCashFlow(raw(),"spark",2026);
const complete=(label:string,amount:string):CheckInput=>({label,amount,complete:true,estimated:false});
const base=()=>({id:"example",label:"Example",formula:"A − B",inputs:[complete("A","1"),complete("B","1")],sources:[],tolerance:"0"});
test("a match requires complete supported independent inputs; zero is valid and incomplete zero never passes",()=>{
 assert.equal(compareCheck(base(),"1","1").status,"reconciled");
 assert.equal(compareCheck(base(),"2","1").status,"difference");
 assert.equal(compareCheck(base(),"0","0").status,"reconciled");
 for(const input of [{...complete("A","0"),complete:false},{...complete("A","0"),estimated:true},{...complete("A","0"),amount:null}])
  assert.equal(compareCheck({...base(),inputs:[input]},"0","0").status,"unverifiable");
 assert.equal(compareCheck(base(),null,"1").difference,null);
 assert.equal(compareCheck(base(),"1","1","Delayed publication").status,"unverifiable");
 assert.equal(compareCheck({...base(),tolerance:"1"},"2","1").status,"reconciled");
 assert.equal(compareCheck(base(),"1.0000000000000000000000001","1").status,"difference");
});
test("Spark October compares actual receipts to the executed September settlement, with real cash gaps left unverified",()=>{
 const checks=reconciliationChecks({prime:"spark",year:2026,month:"2026-10",report:report()});
 const cash=checks.find(c=>c.id==="cash")!;
 assert.equal(cash.status,"unverifiable");assert.equal(cash.tolerance,"5000000");
 assert.equal(cash.difference,report().lines.find(l=>l.id==="reconciliation-gap")!.values["2026-10"].known_value);
 const settlement=checks.find(c=>c.id==="settlement")!;
 assert.equal(settlement.inputs[2].amount,"4218121");
 assert.equal(settlement.status,"reconciled");assert.equal(settlement.difference,"0");
 assert.ok(settlement.sources.some(s=>s.href.includes("28274")));
 assert.equal(checks.filter(c=>c.status==="reconciled").length,1);
});
test("cash reconciliation detects independent differences but blocks partial/estimated/retained claims",()=>{
 const r=report();
 r.monthly_coverage["2026-10"]={missing_chains:[],partial_chains:[],token_registry_gaps:[],classification_complete:true,unclassified_events:0,savings_failures:{}};
 for(const [id,value] of [["opening-cash","100"],["net-cash-change","50"],["closing-cash","150"]]){
  const cell=r.lines.find(l=>l.id===id)!.values["2026-10"];Object.assign(cell,{value,known_value:null,status:"available",quality:"supported"});
 }
 const check=()=>reconciliationChecks({prime:"spark",year:2026,month:"2026-10",report:r})[0];
 assert.equal(check().status,"reconciled");
 r.monthly_coverage["2026-10"]!.classification_complete=false;
 assert.equal(check().status,"unverifiable");
 r.monthly_coverage["2026-10"]!.classification_complete=true;
 r.lines.find(l=>l.id==="closing-cash")!.values["2026-10"].value="6000000";
 assert.equal(check().status,"difference");
 assert.equal(reconciliationChecks({prime:"spark",year:2026,month:"2026-10",report:r,retained:true})[0].status,"unverifiable");
 r.lines.find(l=>l.id==="net-cash-change")!.values["2026-10"].quality="estimate";
 assert.equal(check().status,"unverifiable");
});
test("receipt mismatches remain visible; absence, stale or incomplete receipts never become zero or a pass",()=>{
 const r=report(),receipt=r.lines.find(l=>l.id==="sky-demand-receipts")!.values["2026-10"];
 receipt.value="1";
 const check=()=>reconciliationChecks({prime:"spark",year:2026,month:"2026-10",report:r}).find(c=>c.id==="settlement")!;
 assert.equal(check().status,"difference");
 receipt.status="partial";receipt.known_value=receipt.value;receipt.value=null;
 assert.equal(check().status,"unverifiable");
 const jan=reconciliationChecks({prime:"spark",year:2026,month:"2026-01",report:r}).find(c=>c.id==="settlement")!;
 assert.equal(jan.inputs[2].amount,null);assert.equal(jan.status,"unverifiable");
 assert.equal(reconciliationChecks({prime:"spark",year:2026,month:"2026-10",report:report(),retained:true}).find(c=>c.id==="settlement")!.status,"unverifiable");
});
test("all primes get six honest checks; Grove uses its own published payment and provisional booked expenses",()=>{
 for(const prime of PRIMES){
  const checks=reconciliationChecks({prime,year:2026,month:"2026-10"});
  assert.equal(checks.length,6);assert.ok(checks.every(c=>c.status==="unverifiable"));
 }
 const source=validateStatement(JSON.parse(readFileSync(new URL("./fixtures/spark-history-v3.9.json",import.meta.url),"utf8")),"spark",2026);source.prime="grove";
 const financial=withPrimeExpenses("grove",2026,source,yearMonths(2026,new Date("2026-11-05T00:00:00Z")))!;
 const checks=reconciliationChecks({prime:"grove",year:2026,month:"2026-10",financial});
 const settlement=checks.find(c=>c.id==="settlement")!;
 assert.equal(settlement.inputs[2].amount,"1148408");assert.equal(settlement.inputs[0].amount,null);
 const expenses=checks.find(c=>c.id==="expenses")!;
 assert.notEqual(expenses.inputs[0].amount,null);assert.equal(expenses.inputs[0].estimated,true);
 assert.equal(expenses.inputs[1].amount,null);assert.equal(expenses.status,"unverifiable");
 assert.throws(()=>reconciliationChecks({prime:"grove",year:2026,month:"2026-10",report:report()}),/scope/);
 assert.throws(()=>reconciliationChecks({prime:"spark",year:2026,month:"2025-10"}),/month/);
});

test("references follow execution dates, sum multiple payments, and never certify a delayed cutoff",()=>{
 const grove=reconciliationChecks({prime:"grove",year:2026,month:"2026-03"}).find(c=>c.id==="settlement")!;
 assert.equal(grove.inputs[2].amount,"11720");assert.equal(grove.sources.length,2);
 const r=report();r.periods[9].stale=true;r.periods[9].actual_cutoff="2026-10-11";
 const stale=reconciliationChecks({prime:"spark",year:2026,month:"2026-10",report:r}).find(c=>c.id==="settlement")!;
 assert.equal(stale.status,"unverifiable");assert.equal(stale.inputs[2].amount,null);
 assert.match(stale.message,/cutoff/);
 const future=reconciliationChecks({prime:"spark",year:2026,month:"2026-12",report:report()});
 assert.ok(future.every(c=>c.status==="unverifiable"));
});

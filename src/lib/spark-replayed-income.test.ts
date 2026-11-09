import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {gunzipSync} from "node:zlib";
import test from "node:test";
import {metricAmount,validateStatement} from "./financial.ts";
import {statementCsvRows} from "./financial-export.ts";
import {yearMonths} from "./prime-reports.ts";
import {withPrimeExpenses} from "./spark-expenses.ts";
const fixture=()=>JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/spark-replayed-treasury-income.json.gz",import.meta.url))).toString());
test("replayed treasury vault and SKY reward sources validate and reach the composed dashboard export",()=>{
 const api=validateStatement(fixture(),"spark",2026);
 const statement=withPrimeExpenses("spark",2026,api)!;
 const months=yearMonths(2026,new Date("2026-11-09T00:00:00Z"));
 const csv=statementCsvRows("spark","individual",2026,"2026-11",months,statement);
 for(const [id,month,amount] of [["investment.steakhouse_usdc","2026-01","914.079957"],["investment.sky_staking","2026-03","2095.067540312875692237"]]){
  const line=statement.lines.find(l=>l.id===id)!;assert.ok(line);
  assert.equal(metricAmount(line.values[month]),amount);
  const row=csv.find(r=>r[2]===line.label);assert.ok(row,`Export must include ${id}`);
  assert.equal(row[Number(month.slice(-2))+2],amount);
 }
});
test("new source permissions are specific to reviewed Spark streams, basis, recognition and source revision",()=>{
 for(const change of ["policy","id","recognition","basis","source"]){
  const api=fixture();const line=api.lines.find((l:{id:string})=>l.id==="investment.steakhouse_usdc");
  if(change==="policy")api.policy_version="prime-management.spark-reconciled.v3.10";
  if(change==="id")line.id="investment.unreviewed_treasury";
  const cell=line.values["2026-01"];
  if(change==="recognition")cell.recognition="receipt";
  if(change==="basis")cell.basis="unreviewed_basis";
  if(change==="source")cell.source_ref="0".repeat(64);
  assert.throws(()=>validateStatement(api,"spark",2026),/Financial reporting contract mismatch/,change);
 }
});

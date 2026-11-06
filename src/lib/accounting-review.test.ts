import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import Decimal from "decimal.js";
import { metricAmount, validateStatement } from "./financial.ts";
import { withPrimeExpenses, expenseReportingCutoff } from "./spark-expenses.ts";

const fixture = () => JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/spark-accounting-review.json.gz", import.meta.url))).toString());

test("corrected October API values validate and feed the two-level expense statement", () => {
  const api = validateStatement(fixture(), "spark", 2026);
  assert.equal(api.as_of, "2026-10-31");
  assert.equal(expenseReportingCutoff("spark"), "2026-10-31");
  assert.equal(api.lines.find(l=>l.id==="demand.distribution_rewards")!.values["2026-10"].value, null);
  assert.equal(api.periods[10].state, "future");
  const fees=metricAmount(api.lines.find(l=>l.id==="fees.sparklend.nonstable")!.values["2026-10"]);
  assert.ok(fees && new Decimal(fees).gt(97000));
  const statement=withPrimeExpenses("spark",2026,api)!;
  assert.equal(statement.statement_rows!.some(r=>r.id==="expenses.compensation.engineering"),false);
  assert.equal(statement.lines.find(l=>l.id==="expenses.compensation.spk")!.values["2026-10"].status,"unavailable");
  const net=statement.lines.find(l=>l.id==="dashboard.net_income")!.values["2026-10"];
  assert.equal(net.status,"partial");
  assert.ok(net.known_value);
});

test("an approved contributor amount feeds compensation once with independent input provenance", () => {
  const api=fixture();
  const contributor=api.lines.find((l:{id:string})=>l.id==="expenses.compensation.spk");
  const cell=contributor.values["2026-10"];
  const prior=withPrimeExpenses("spark",2026,validateStatement(api,"spark",2026))!;
  contributor.values["2026-10"]={...cell,status:"available",value:"100",known_value:null,reason:null};
  // Composition uses the explicit API expense input, not vesting transfer quantities.
  const next=withPrimeExpenses("spark",2026,validateStatement(api,"spark",2026))!;
  const get=(r:typeof next,id:string)=>metricAmount(r.lines.find(l=>l.id===id)!.values["2026-10"])!;
  assert.equal(new Decimal(get(next,"expenses.compensation")).minus(get(prior,"expenses.compensation")).toString(),"100");
  assert.equal(new Decimal(get(prior,"dashboard.net_income")).minus(get(next,"dashboard.net_income")).toString(),"100");
  contributor.values["2026-10"].input_revision="f".repeat(64);
  assert.throws(()=>validateStatement(api,"spark",2026),/contract mismatch/);
});

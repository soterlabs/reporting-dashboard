import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import test from "node:test";
import Decimal from "decimal.js";
import { metricAmount, validateStatement } from "./financial.ts";
import { statementCsvRows } from "./financial-export.ts";
import { yearMonths } from "./prime-reports.ts";
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


test("live November MTD cells remain visible while YTD and exported totals stop at October expenses", () => {
  const api = validateStatement(fixture(), "spark", 2026);
  api.as_of = "2026-11-05";
  api.periods[10] = { ...api.periods[10], state: "partial", expected_cutoff: "2026-11-05", actual_cutoff: "2026-11-04" };
  const revenue = api.lines.find(l => l.id === "statement.net_revenue")!;
  revenue.values["2026-11"] = { ...revenue.values["2026-10"], status: "available", value: "1234567", known_value: null, period_end: "2026-11-04" };
  const original = structuredClone(api);
  const report = withPrimeExpenses("spark", 2026, api, undefined, undefined, undefined, expenseReportingCutoff("spark"))!;
  assert.deepEqual(api, original);
  assert.equal(report.periods[10].state, "partial");
  assert.equal(metricAmount(report.lines.find(l => l.id === revenue.id)!.values["2026-11"]), "1234567");
  assert.equal(metricAmount(report.lines.find(l => l.id === "expenses.total")!.values["2026-11"]), null);
  assert.equal(metricAmount(report.lines.find(l => l.id === "dashboard.net_income")!.values["2026-11"]), null);
  assert.equal(report.dashboard_composition!.totals_through, "2026-10-31");
  const expected = api.periods.slice(0, 10).reduce((sum, p) => sum.plus(metricAmount(revenue.values[p.key]) || 0), new Decimal(0));
  assert.ok(expected.minus(metricAmount(report.lines.find(l => l.id === revenue.id)!.total)!).abs().lt("0.000001"));
  const csv = statementCsvRows("spark", "individual", 2026, "2026-11", yearMonths(2026), report);
  const csvRevenue = csv.find(row => row[2] === "Total net revenue")!;
  assert.equal(csvRevenue[13], "1234567");
  assert.equal(csvRevenue[15], metricAmount(report.lines.find(l => l.id === revenue.id)!.total));
  assert.equal(csvRevenue[csv[0].indexOf("YTD cutoff UTC")], "2026-10-31");
  assert.ok(csv.every(row => row.length === csv[0].length));
  const retained = withPrimeExpenses("spark", 2026, api, undefined, report.dashboard_composition!.expense_revision, api.as_of, report.dashboard_composition!.totals_through)!;
  assert.equal(retained.dashboard_composition!.display_hash, report.dashboard_composition!.display_hash);
});

test("comparable YTD excludes a historical partial month and validates the requested expense cutoff", () => {
  const api = validateStatement(fixture(), "spark", 2026);
  api.as_of = "2026-10-15";
  api.periods[9] = { ...api.periods[9], state: "partial", expected_cutoff: "2026-10-15" };
  const report = withPrimeExpenses("spark", 2026, api, undefined, undefined, undefined, "2026-10-31")!;
  assert.equal(report.dashboard_composition!.totals_through, "2026-09-30");
  for (const line of report.lines) assert.ok(!line.total.component_ids?.includes("2026-10"));
  for (const cutoff of ["2026-10-30", "2026-02-30", "2026-11-30", "2026-99-31"])
    assert.throws(() => withPrimeExpenses("spark", 2026, api, undefined, undefined, undefined, cutoff), /YTD expense cutoff/);
});


test("live November with historical SDE split dust validates without accepting material split errors", () => {
  const raw = () => JSON.parse(gunzipSync(readFileSync(new URL("./fixtures/spark-november-accounting.json.gz", import.meta.url))).toString());
  const api = validateStatement(raw(), "spark", 2026);
  assert.equal(api.periods[10].state, "partial");
  assert.ok(metricAmount(api.lines.find(l => l.id === "statement.interest")!.values["2026-11"]));
  const corrupt = raw();
  const split = corrupt.lines.find((l: { id: string }) => l.id === "investment.amm.curve.susds_usdt").values["2026-06"].allocation_split;
  // Real production split differs by 3e-24 USD; an altered allocation is rejected.
  split.sky_income_usd = new Decimal(split.sky_income_usd).plus("0.0000000001").toFixed(28);
  assert.throws(() => validateStatement(corrupt, "spark", 2026), /contract mismatch/);
});

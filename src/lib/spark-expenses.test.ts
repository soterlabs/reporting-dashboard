import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Decimal from "decimal.js";
import { expenseSnapshotRevision, validateExpenseSnapshot, withSparkExpenses } from "./spark-expenses.ts";
import { metricAmount, validateStatement, type FinancialStatement } from "./financial.ts";
import { numberConfidence } from "./number-confidence.ts";
import { statementLines, yearMonths } from "./prime-reports.ts";
import { statementCsvRows } from "./financial-export.ts";
import { statementFinancialLine, statementRowUncertainty } from "./statement-values.ts";
const D = Decimal.clone({ precision: 100 });
const calendar = yearMonths(2026, new Date("2026-11-05T00:00:00Z"));
const raw = JSON.parse(readFileSync(new URL("./data/spark-expenses-2026.v1.json", import.meta.url), "utf8"));
function input(): FinancialStatement {
  const r = validateStatement(JSON.parse(readFileSync(new URL("./fixtures/spark-history-v3.9.json", import.meta.url), "utf8")), "spark", 2026);
  const revenue = r.lines.find(l => l.id === "statement.net_revenue")!;
  for (let i = 1; i <= 11; i++) {
    const m = `2026-${String(i).padStart(2, "0")}`;
    revenue.values[m] = { ...revenue.values[m], value: i === 11 ? "999999999" : "2000000", known_value: null, status: "available" };
  }
  return r;
}
const line = (r: FinancialStatement, id: string) => r.lines.find(l => l.id === id)!;

test("only relevant Spark 2026 expense rows are included; controls reconcile without copying inception totals or memos", () => {
  const data = validateExpenseSnapshot(raw);
  assert.equal(data.lines.length, 22);
  assert.ok(data.lines.every(l => l.source_row >= 6 && l.source_row <= 27));
  assert.ok(data.lines.every(l => Object.keys(l.values).length === 12 && Object.keys(l.values).every(m => m.startsWith("2026-"))));
  assert.ok(data.lines.every(l => l.values["2026-11"] === null && l.values["2026-12"] === null));
  assert.equal(data.operating_basis["2026-04"], "reported_actual_unverified");
  assert.equal(data.operating_basis["2026-10"], "budget_30_percent_reduction_scenario");
  const r = withSparkExpenses("spark", 2026, input(), calendar)!;
  assert.equal(line(r,"expenses.operating").values["2026-10"].value,"808282");
  assert.equal(line(r,"expenses.total").values["2026-10"].value,"928282");
  for (const parent of data.lines.filter(l => [6,7,13,19,23,27].includes(l.source_row)))
    for (let i=1;i<=10;i++) {
      const m=`2026-${String(i).padStart(2,"0")}`;
      assert.ok(new D(metricAmount(line(r,parent.id).values[m])!).minus(parent.values[m]!).abs().lte("0.01"));
    }
});

test("API revenue, funding, original expense placeholders, source manifest and hashes remain untouched", () => {
  const original=input(), before=structuredClone(original);
  const r=withSparkExpenses("spark",2026,original,calendar)!;
  assert.deepEqual(original,before);
  assert.deepEqual(r.lines.slice(0,before.lines.length),before.lines);
  assert.deepEqual(r.source_manifest,before.source_manifest);
  assert.equal(r.report_hash,before.report_hash);
  assert.equal(r.selection,before.selection);
  assert.equal(r.dashboard_composition?.api_report_hash,before.report_hash);
  assert.match(r.dashboard_composition!.display_hash,/^[a-f0-9]{64}$/);
  assert.notEqual(r.dashboard_composition!.display_hash,r.report_hash);
  assert.throws(()=>withSparkExpenses("spark",2026,r,calendar),/original API input/);
  assert.equal(withSparkExpenses("grove",2026,original,calendar),original);
  assert.equal(withSparkExpenses("spark",2027,undefined),undefined);
});

test("monthly and annual net income use matching revenue and expense months, never a missing November expense of zero", () => {
  const r=withSparkExpenses("spark",2026,input(),calendar)!;
  const net=line(r,"dashboard.net_income"), expenses=line(r,"expenses.total");
  assert.equal(net.values["2026-10"].value,"1071718");
  assert.equal(metricAmount(net.values["2026-11"]),null);
  assert.equal(metricAmount(expenses.values["2026-11"]),null);
  const total=Array.from({length:10},(_,i)=>`2026-${String(i+1).padStart(2,"0")}`).reduce((sum,m)=>sum.plus(new D("2000000").minus(expenses.values[m].value!)),new D(0));
  assert.equal(metricAmount(net.total),total.toString());
  assert.equal(net.total.status,"partial");
  assert.ok(net.total.missing_components?.includes("2026-11"));
  assert.equal(net.values["2026-12"].status,"future");
});

test("all imported amounts and derived results are provisional orange; real zeroes, blanks and future periods remain distinct", () => {
  const r=withSparkExpenses("spark",2026,input(),calendar)!;
  for (const id of r.dashboard_composition!.local_metric_ids) {
    const l=line(r,id);
    for (const cell of [...Object.values(l.values),l.total]) {
      if (metricAmount(cell)!==null) assert.equal(numberConfidence(metricAmount(cell),cell).tone,"uncertain",id);
    }
  }
  const risk=line(r,"expenses.compensation.credit_risk");
  assert.equal(new D(risk.values["2026-01"].value!).isZero(),true);
  assert.equal(risk.values["2026-11"].status,"unavailable");
  assert.equal(risk.values["2026-12"].status,"future");
});

test("staff functions and external-service detail retain indentation and a unique place in the hierarchy", () => {
  const r=withSparkExpenses("spark",2026,input(),calendar)!;
  const rows=statementLines("spark","individual",r);
  assert.equal(new Set(rows.map(r=>r.id)).size,rows.length);
  const staff=rows.find(l=>l.id==="expenses.compensation.engineering")!;
  assert.equal(staff.parent,"expenses.compensation");assert.equal(staff.level,3);
  assert.equal(rows.find(l=>l.id==="expenses.compensation")!.parent,"operating");
  assert.equal(rows.find(l=>l.id==="expenses.external_services.legal")!.level,3);
  assert.equal(rows.find(l=>l.id==="net-income")!.metricId,"dashboard.net_income");
  assert.match(statementRowUncertainty(r,staff,"2026-01",true)!,/Provisional workbook/);
});

test("a retained MTD report never imports the later full-month workbook expense, even after calendar rollover", () => {
  const source=input();source.as_of="2026-10-27";
  source.periods[9]={...source.periods[9],state:"partial",expected_cutoff:"2026-10-27"};
  source.periods[10]={...source.periods[10],state:"future",expected_cutoff:null};
  const r=withSparkExpenses("spark",2026,source,yearMonths(2026,new Date("2027-01-05")))!;
  assert.equal(metricAmount(line(r,"expenses.total").values["2026-10"]),null);
  assert.equal(metricAmount(line(r,"dashboard.net_income").values["2026-10"]),null);
  assert.notEqual(metricAmount(line(r,"expenses.total").values["2026-09"]),null);
});

test("CSV shares the UI's local figures and signed calculations, with separately pinned dataset and API provenance", () => {
  const source=input(), r=withSparkExpenses("spark",2026,source,calendar)!;
  const rows=statementCsvRows("spark","individual",2026,"2026-10",calendar,r),headers=rows[0];
  assert.ok(rows.every(row=>row.length===headers.length));
  const net=rows.find(row=>row[2]==="Net income")!;
  assert.equal(net[12],"1071718");assert.equal(net[13],"TBD");
  assert.equal(net[18],source.report_hash);assert.equal(net[19],source.selection);
  assert.equal(net[headers.indexOf("Expense snapshot revision")],expenseSnapshotRevision);
  assert.equal(net[headers.indexOf("Dashboard display hash")],r.dashboard_composition!.display_hash);
  assert.deepEqual(JSON.parse(net[headers.indexOf("Dashboard signed components")] as string),[{id:"statement.net_revenue",sign:1},{id:"expenses.total",sign:-1}]);
  const ui=statementLines("spark","individual",r);
  for(const row of ui.filter(row=>row.metricId?.startsWith("expenses."))) {
    const exported=rows.find(csv=>csv[headers.indexOf("Row ID")]===row.id)!;
    assert.equal(exported[12],metricAmount(statementFinancialLine(r,row)?.values["2026-10"])??"TBD");
  }
  const legacy=statementCsvRows("spark","individual",2026,"2026-10",calendar,source);
  assert.equal(legacy[0].includes("Expense snapshot revision"),false);
});

test("expenses remain readable without the revenue API, with explicit absence and stable offline-export cutoff", () => {
  const r=withSparkExpenses("spark",2026,null,calendar)!;
  assert.equal(r.dashboard_composition!.api_report_hash,null);
  assert.equal(r.dashboard_composition!.api_selection,null);
  assert.equal(r.report_hash,"");assert.equal(r.selection,"");
  assert.equal(line(r,"expenses.total").values["2026-10"].value,"928282");
  assert.equal(metricAmount(line(r,"dashboard.net_income").values["2026-10"]),null);
  const retained=withSparkExpenses("spark",2026,null,yearMonths(2026,new Date("2027-01-02")),expenseSnapshotRevision,r.as_of)!;
  assert.equal(retained.dashboard_composition!.display_hash,r.dashboard_composition!.display_hash);
  assert.throws(()=>withSparkExpenses("spark",2026,null,calendar,"f".repeat(64)),/snapshot is unavailable/);
  assert.throws(()=>withSparkExpenses("spark",2026,null,calendar,expenseSnapshotRevision,"2026-12-31"),/completed day/);
});

test("invalid or unbalanced manual snapshots fail instead of silently showing incorrect totals", () => {
  for(const mutate of [
    (x:typeof raw)=>{x.quality="supported";},
    (x:typeof raw)=>{x.lines[0].values["2026-01"]="999999999";},
    (x:typeof raw)=>{x.lines[1].parent=x.lines[1].id;},
    (x:typeof raw)=>{x.lines[0].values["2025-01"]="1";},
  ]) {
    const bad=structuredClone(raw);mutate(bad);assert.throws(()=>validateExpenseSnapshot(bad));
  }
});

test("dashboard composition metadata cannot be ingested as an API publication", () => {
  const rawApi=input();
  (rawApi as FinancialStatement).dashboard_composition={ policy_version:"forged", expense_revision:expenseSnapshotRevision, expense_source:{file:"x",sheet:"Spark",sha256:"f".repeat(64),data_file:"x"},api_report_hash:rawApi.report_hash,api_selection:rawApi.selection,display_hash:"f".repeat(64),local_metric_ids:[] };
  assert.throws(()=>validateStatement(rawApi,"spark",2026),/contract mismatch/);
});

test("no completed days at year start produce future cells, with no invented expense zero or API hash", () => {
  const early=yearMonths(2026,new Date("2026-01-01T00:00:00Z"));
  const r=withSparkExpenses("spark",2026,null,early)!;
  assert.equal(r.as_of,"2025-12-31");
  assert.ok(Object.values(line(r,"expenses.total").values).every(c=>c.status==="future" && metricAmount(c)===null));
  assert.equal(metricAmount(line(r,"expenses.total").total),null);
  assert.equal(r.dashboard_composition!.api_report_hash,null);
});

test("partial revenue remains a known provisional net result, and completely missing data identifies both inputs", () => {
  const report=validateStatement(JSON.parse(readFileSync(new URL("./fixtures/spark-history-v3.9.json",import.meta.url),"utf8")),"spark",2026);
  const r=withSparkExpenses("spark",2026,report,calendar)!;
  const rawRevenue=line(report,"statement.net_revenue").values["2026-10"];
  const net=line(r,"dashboard.net_income").values["2026-10"];
  assert.equal(net.status,"partial");assert.equal(net.value,null);
  assert.equal(net.known_value,new D(metricAmount(rawRevenue)!).minus("928282").toString());
  const missing=withSparkExpenses("spark",2026,null,calendar)!;
  assert.deepEqual(line(missing,"dashboard.net_income").values["2026-11"].missing_components,["statement.net_revenue","expenses.total"]);
});

test("the operating expense tooltip distinguishes estimates, unverified actuals and the October reduction scenario", () => {
  const r=withSparkExpenses("spark",2026,input(),calendar)!;
  const operating=line(r,"expenses.operating");
  assert.equal(operating.values["2026-01"].reason,"provisional_estimated_grant_run_rate");
  assert.equal(operating.values["2026-04"].reason,"provisional_reported_actual_unverified");
  assert.equal(operating.values["2026-10"].reason,"provisional_budget_30_percent_reduction_scenario");
});


test("full-month expenses never produce net income against a stale mid-month revenue cutoff", () => {
  const source = input();
  source.periods[9] = { ...source.periods[9], actual_cutoff: "2026-10-27", expected_cutoff: "2026-10-31", stale: true };
  const report = withSparkExpenses("spark", 2026, source, calendar)!;
  assert.equal(metricAmount(line(report, "expenses.total").values["2026-10"]), "928282");
  assert.equal(metricAmount(line(report, "dashboard.net_income").values["2026-10"]), null);
  assert.equal(line(report, "dashboard.net_income").values["2026-10"].reason, "revenue_and_expense_cutoffs_differ");
  const october = line(source, "statement.net_revenue").values["2026-10"];
  october.period_end = "2026-10-25";
  source.periods[9].actual_cutoff = "2026-10-31";
  assert.equal(metricAmount(line(withSparkExpenses("spark", 2026, source, calendar)!, "dashboard.net_income").values["2026-10"]), null);
});

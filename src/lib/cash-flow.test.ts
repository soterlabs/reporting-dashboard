import { test } from "node:test";
import assert from "node:assert/strict";
import { cashFlowSnapshot, cashFlowLayout, cashFlowMetric, cashFlowCsvRows, cashFlowCalendar, cashFlowAsOf, validateCashFlowSnapshot } from "./cash-flow.ts";
import { yearMonths, collapsedStatementGroups } from "./prime-reports.ts";
import { visibleStatementLines } from "./statement-layout.ts";
import { numberConfidence } from "./number-confidence.ts";
const months = yearMonths(2026,new Date("2026-11-05T00:00:00Z"));
const row = (id:string) => cashFlowSnapshot.rows.find(r => r.id === id)!;

test("cash flow preserves workbook operating, investing and financing figures and shows all amounts as provisional", () => {
  assert.equal(cashFlowSnapshot.source.sheet,"Cash Flow Statement - Spark");
  assert.match(cashFlowSnapshot.source.sha256,/^[a-f0-9]{64}$/);
  assert.equal(cashFlowMetric(row("net-operating"),months,"2026-10").value,"5009457");
  assert.equal(cashFlowMetric(row("net-financing"),months,"2026-10").value,"97083679");
  assert.equal(cashFlowMetric(row("net-cash-change"),months,"2026-10").value,"102093136");
  assert.equal(cashFlowMetric(row("net-cash-change"),months).value,"-133416396");
  for(const r of cashFlowSnapshot.rows.filter(r=>r.kind!=="section"))for(const m of [...months.map(m=>m.key),undefined]){
    const cell=cashFlowMetric(r,months,m);if(cell.value!==null)assert.equal(numberConfidence(cell.value,cell).tone,"uncertain");
  }
});
test("blank inputs and formula zeroes beyond source coverage never become observed cash flows", () => {
  assert.equal(cashFlowMetric(row("allocation-changes"),months,"2026-10").value,null);
  assert.equal(cashFlowMetric(row("non-stable-gains"),months).value,null);
  assert.equal(row("net-operating").values["2026-11"],"0");
  assert.equal(cashFlowMetric(row("net-operating"),months,"2026-11").value,null);
  assert.equal(cashFlowMetric(row("net-operating"),months,"2026-12").status,"future");
  assert.equal(cashFlowMetric(row("investments"),months,"2026-10").value,"0.0");
});
test("cash reconciliation keeps stock balances separate from cash flows and retains measured gaps", () => {
  assert.equal(cashFlowMetric(row("opening-cash"),months).value,"415850209.0");
  assert.equal(cashFlowMetric(row("closing-cash"),months).value,"282433813");
  assert.equal(cashFlowMetric(row("measured-cash"),months).value,"177289611.0");
  assert.equal(cashFlowMetric(row("reconciliation-gap"),months,"2026-10").value,"-135229083");
  assert.equal(cashFlowMetric(row("cumulative-gap"),months).value,"-105144202");
  assert.match(cashFlowMetric(row("measured-cash"),months).source_paths[0],/L82$/);
  assert.ok(cashFlowLayout().every(r=>!cashFlowSnapshot.rows.find(s=>s.id===r.id)!.check));
});
test("cash flow groups start collapsed, preserve indentation and never duplicate statement/check rows", () => {
  const layout=cashFlowLayout(),collapsed=collapsedStatementGroups(layout),visible=visibleStatementLines(layout,collapsed);
  assert.equal(visible.some(r=>r.id==="expenses-paid"),false);
  assert.equal(layout.find(r=>r.id==="expenses-paid")!.level,2);
  assert.equal(layout.find(r=>r.id==="expenses-paid")!.parent,"payables");
  const all=[...layout,...cashFlowLayout(true)];assert.equal(new Set(all.map(r=>r.id)).size,all.length);
});
test("cash flow CSV shares visible metrics, preserves source precision and does not fill unsupported years or future periods", () => {
  const csv=cashFlowCsvRows(2026,months),header=csv[0];
  const flow=csv.find(r=>r[header.indexOf("Row ID")]==="net-cash-change")!;
  assert.equal(flow[10],"102093136");assert.equal(flow[11],"TBD");assert.equal(flow[12],"—");
  assert.equal(flow[13],cashFlowMetric(row("net-cash-change"),months).value);
  assert.equal(cashFlowCsvRows(2025).length,0);
  assert.equal(cashFlowMetric(row("net-cash-change"),yearMonths(2025)).value,null);
  const earlier=yearMonths(2026,new Date("2026-10-05T00:00:00Z"));
  assert.equal(cashFlowMetric(row("net-cash-change"),earlier,"2026-10").value,null);
  assert.notEqual(cashFlowMetric(row("net-cash-change"),earlier).value,"-133416396");
});


test("pinned cash flow dates survive calendar rollover and reject invalid or future cutoffs", () => {
  const asOf = cashFlowAsOf(months);
  const later = cashFlowCalendar(asOf,new Date("2027-02-01T00:00:00Z"));
  assert.deepEqual(cashFlowCsvRows(2026,later),cashFlowCsvRows(2026,months));
  for(const invalid of ["2026-02-30","2027-01-01","2026-11-05","2025-12-30"])
    assert.throws(() => cashFlowCalendar(invalid,new Date("2026-11-05T00:00:00Z")),/Invalid cash flow cutoff/);
  assert.equal(cashFlowAsOf(cashFlowCalendar("2025-12-31",new Date("2026-01-01T00:00:00Z"))),"2025-12-31");
});
test("manual snapshot errors fail before publishing wrong workbook figures", () => {
  assert.equal(validateCashFlowSnapshot(cashFlowSnapshot),cashFlowSnapshot);
  const mutate = (fn:(r:typeof cashFlowSnapshot)=>void) => {const clone=structuredClone(cashFlowSnapshot);fn(clone);assert.throws(()=>validateCashFlowSnapshot(clone),/Cash flow snapshot:/);};
  mutate(s=>{s.rows[1].values["2026-01"]="9000000";});
  mutate(s=>{s.rows[1].values["2026-01"]="NaN";});
  mutate(s=>{s.rows[1].id=s.rows[0].id;});
  mutate(s=>{s.rows[1].parent="missing";});
  mutate(s=>{s.prime="grove";});
});

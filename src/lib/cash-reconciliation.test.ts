import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Decimal from "decimal.js";
import { cashReconciliationStatus, cashReconciliationPercentage } from "./cash-reconciliation.ts";

const raw = () => JSON.parse(readFileSync(new URL("./fixtures/spark-cash-flow-api.json", import.meta.url), "utf8"));
const month = "2026-10";
test("monthly percentage uses the absolute gap over measured closing cash, independently of certification", () => {
  const report = raw();
  const gap = report.lines.find((r: { id: string }) => r.id === "reconciliation-gap").values[month];
  const cash = report.lines.find((r: { id: string }) => r.id === "measured-cash").values[month];
  Object.assign(cash, { value: null, known_value: "200", status: "partial" });
  for (const value of ["1", "-1"]) {
    Object.assign(gap, { value: null, known_value: value, status: "partial", quality: "estimate" });
    const percentage = cashReconciliationPercentage(report, month);
    assert.equal(percentage.label, "0.50%");
    assert.equal(percentage.estimated, true);
    assert.equal(cashReconciliationStatus(report, month).label, "Incomplete");
  }
  gap.known_value = "0.000001";
  assert.equal(cashReconciliationPercentage(report, month).label, "0.00%");
  assert.match(cashReconciliationPercentage(report, month).detail, /Higher precision: 5e-7%/);
  assert.equal(cashReconciliationStatus(report, month).label, "Incomplete");
});

test("missing or nonpositive cash never becomes a zero percentage; future ratios remain blank", () => {
  const report = raw();
  const cash = report.lines.find((r: { id: string }) => r.id === "measured-cash").values[month];
  for (const value of [null, "0", "-1"]) {
    Object.assign(cash, { value: null, known_value: value });
    assert.equal(cashReconciliationPercentage(report, month).label, "TBD");
  }
  cash.value = "100";
  Object.assign(report.lines.find((r: { id: string }) => r.id === "reconciliation-gap").values[month], { value: null, known_value: null });
  assert.equal(cashReconciliationPercentage(report, month).label, "TBD");
  assert.equal(cashReconciliationPercentage(report, "2026-12").label, "—");
});
function complete() {
  const report = raw();
  report.monthly_coverage[month] = { classification_complete: true, missing_chains: [], partial_chains: [], token_registry_gaps: [], unclassified_events: 0, savings_failures: {}, allocation_basis_failures: {} };
  const period = report.periods.find((p: { key: string }) => p.key === month);
  period.stale = false;
  for (const line of report.lines) {
    const cell = line.values[month];
    Object.assign(cell, { value: cell.value ?? cell.known_value ?? "0", known_value: null, status: "available", quality: "supported" });
  }
  for (const [id, value] of [["opening-cash", "100"], ["closing-cash", "110"], ["measured-cash", "110"], ["measured-change", "10"], ["net-cash-change", "10"], ["reconciliation-gap", "0"]]) {
    report.lines.find((r: { id: string }) => r.id === id).values[month].value = value;
  }
  return report;
}

test("a small or zero published partial gap cannot certify reconciliation", () => {
  const report = raw();
  const gap = report.lines.find((r: { id: string }) => r.id === "reconciliation-gap").values[month];
  gap.known_value = "0";
  assert.equal(cashReconciliationStatus(report, month).label, "Incomplete");
  assert.equal(cashReconciliationStatus(report, "2026-12").label, "—");
});

test("complete comparisons use the unrounded symmetric workbook tolerance", () => {
  const report = complete();
  const gap = report.lines.find((r: { id: string }) => r.id === "reconciliation-gap").values[month];
  for (const value of ["0", "5000000", "-5000000"]) {
    gap.value = value;
    report.lines.find((r: { id: string }) => r.id === "net-cash-change").values[month].value = new Decimal(10).minus(value).toString();
    assert.equal(cashReconciliationStatus(report, month).label, "OK");
  }
  for (const value of ["5000000.000001", "-5000000.000001"]) {
    gap.value = value;
    report.lines.find((r: { id: string }) => r.id === "net-cash-change").values[month].value = new Decimal(10).minus(value).toString();
    assert.equal(cashReconciliationStatus(report, month).label, "Difference remains");
  }
});

test("a zero or small reported gap cannot pass if it contradicts the cash balance equations", () => {
  for (const [id, value] of [["closing-cash", "111"], ["measured-cash", "111"], ["measured-change", "11"], ["net-cash-change", "9"], ["reconciliation-gap", "1"]]) {
    const report = complete();
    report.lines.find((r: { id: string }) => r.id === id).values[month].value = value;
    const result = cashReconciliationStatus(report, month);
    assert.equal(result.label, "Incomplete");
    assert.match(result.detail, /do not agree/);
  }
});

test("known values cannot pass when coverage, source freshness or accounting inputs remain unresolved", () => {
  for (const mutate of [
    (r: ReturnType<typeof raw>) => r.monthly_coverage[month].missing_chains.push("xlayer"),
    (r: ReturnType<typeof raw>) => r.monthly_coverage[month].unclassified_events = 1,
    (r: ReturnType<typeof raw>) => r.monthly_coverage[month].allocation_basis_failures.S17 = "Unknown subscription cost",
    (r: ReturnType<typeof raw>) => delete r.monthly_coverage[month].savings_failures,
    (r: ReturnType<typeof raw>) => r.periods.find((p: { key: string }) => p.key === month).stale = true,
    (r: ReturnType<typeof raw>) => r.lines.find((l: { id: string }) => l.id === "net-cash-change").values[month].quality = "estimate",
  ]) {
    const report = complete();
    mutate(report);
    assert.equal(cashReconciliationStatus(report, month).label, "Incomplete");
  }
  assert.equal(cashReconciliationStatus(complete(), month, true).label, "Incomplete");
});

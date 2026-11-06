import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { cashReconciliationStatus } from "./cash-reconciliation.ts";

const raw = () => JSON.parse(readFileSync(new URL("./fixtures/spark-cash-flow-api.json", import.meta.url), "utf8"));
const month = "2026-10";
function complete() {
  const report = raw();
  report.monthly_coverage[month] = { classification_complete: true, missing_chains: [], partial_chains: [], token_registry_gaps: [], unclassified_events: 0, savings_failures: {}, allocation_basis_failures: {} };
  const period = report.periods.find((p: { key: string }) => p.key === month);
  period.stale = false;
  for (const line of report.lines) {
    const cell = line.values[month];
    Object.assign(cell, { value: cell.value ?? cell.known_value ?? "0", known_value: null, status: "available", quality: "supported" });
  }
  report.lines.find((r: { id: string }) => r.id === "reconciliation-gap").values[month].value = "0";
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
    assert.equal(cashReconciliationStatus(report, month).label, "OK");
  }
  for (const value of ["5000000.000001", "-5000000.000001"]) {
    gap.value = value;
    assert.equal(cashReconciliationStatus(report, month).label, "Difference remains");
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

import Decimal from "decimal.js";
import type { CashFlowReport } from "./cash-flow-api.ts";

const D = Decimal.clone({ precision: 150 });

export const cashReconciliationRows = [
  { id: "measured-cash", label: "Cash measured at month end", level: 0 },
  { id: "measured-change", label: "Change in measured cash", level: 0 },
  { id: "net-cash-change", label: "Net cash change per statement", level: 0 },
  { id: "reconciliation-gap", label: "Gap: measured change minus statement", level: 0 },
  { id: "cumulative-gap", label: "Cumulative gap", level: 0 },
  { id: "reconciliation-status", label: "Status", level: 0 },
];

export function cashReconciliationStatus(report: CashFlowReport, month: string, retained = false) {
  const period = report.periods.find(p => p.key === month);
  if (period?.state === "future") return { label: "—", detail: "Future period" };
  const coverage = report.monthly_coverage[month];
  const inputs = ["opening-cash", "closing-cash", "measured-cash", "measured-change", "net-cash-change", "reconciliation-gap"]
    .map(id => report.lines.find(line => line.id === id)?.values[month]);
  if (retained || !period?.revision || period.stale || !coverage ||
      coverage.classification_complete !== true || coverage.missing_chains.length ||
      coverage.partial_chains?.length || coverage.token_registry_gaps?.length ||
      coverage.unclassified_events !== 0 || !coverage.savings_failures || Object.keys(coverage.savings_failures).length ||
      Object.keys(coverage.allocation_basis_failures || {}).length ||
      inputs.some(cell => cell?.status !== "available" || cell.quality !== "supported" || cell.value === null)) {
    return { label: "Incomplete", detail: "Missing, estimated, delayed or unclassified inputs; the gap is not a complete reconciliation." };
  }
  const [opening, closing, measured, change, statement, gap] = inputs.map(cell => new D(cell!.value!));
  if (!measured.equals(closing) || !change.equals(closing.minus(opening)) || !gap.equals(change.minus(statement))) {
    return { label: "Incomplete", detail: "Published balances, cash change and reconciliation gap do not agree." };
  }
  const withinTolerance = gap.abs().lte("5000000");
  return withinTolerance
    ? { label: "OK", detail: "Complete supported inputs; monthly gap within the workbook's 5m tolerance." }
    : { label: "Difference remains", detail: "Monthly gap exceeds the workbook's 5m tolerance." };
}

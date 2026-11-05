import Decimal from "decimal.js";
import snapshot from "./data/spark-cash-flow-2026.v1.json" with { type: "json" };
import { yearMonths, type StatementLine, type Month } from "./prime-reports.ts";
import type { Metric } from "./financial.ts";

const D = Decimal.clone({ precision: 100 });
export const cashFlowSnapshot = snapshot;
export type CashFlowRow = typeof snapshot.rows[number];
export function cashFlowLayout(checks = false): StatementLine[] {
  return snapshot.rows.filter(r => r.check === checks).map(r => ({
    id: r.id, label: r.label, level: r.depth, parent: r.parent || undefined,
    kind: (r.kind || undefined) as StatementLine["kind"],
  }));
}
export function cashFlowMetric(row: CashFlowRow, months: Month[], month?: string): Metric {
  const eligible = months.filter(m => m.key.startsWith(`${snapshot.year}-`) && m.state === "complete" && m.cutoff && m.cutoff <= snapshot.coverage_end);
  const values = eligible.map(m => row.values[m.key as keyof typeof row.values]).filter((v): v is string => v !== null);
  let value: string | null = null;
  if (month) value = eligible.some(m => m.key === month) ? row.values[month as keyof typeof row.values] ?? null : null;
  else if (values.length) value = row.aggregation === "first" ? values[0] : row.aggregation === "last" ? values.at(-1)! : values.reduce((s,v) => s.plus(v), new D(0)).toString();
  const knownPeriods = eligible.filter(m => row.values[m.key as keyof typeof row.values] !== null);
  const sourcePeriods = month ? [month] : row.aggregation === "first" ? knownPeriods.slice(0,1).map(m => m.key) : row.aggregation === "last" ? knownPeriods.slice(-1).map(m => m.key) : knownPeriods.map(m => m.key);
  const future = !!month && months.find(m => m.key === month)?.state === "future";
  return { value, known_value: null, status: future ? "future" : value !== null ? "available" : "unavailable",
    unit: "USD", quality: "estimate", recognition: "unknown", basis: "provisional_cash_flow_workbook_snapshot",
    reason: "Workbook figure; independent of live API income; reconciliation gaps unresolved",
    source_paths: sourcePeriods.map(key => `${snapshot.source.file}#${snapshot.source.sheet}!${String.fromCharCode(66 + Number(key.slice(5)))}${row.source_row}`) };
}
export function cashFlowCsvRows(year: number, months = yearMonths(year)): unknown[][] {
  if (year !== snapshot.year) return [];
  return [["Line item", ...months.map(m => `${m.label} ${year}`), "YTD", "Row ID", "Parent row ID", "Depth", "Section", "Quality", "Source", "Workbook total (control)", "Note"],
    ...snapshot.rows.map(row => [row.label, ...months.map(m => row.kind === "section" ? "" : m.state === "future" ? "—" : cashFlowMetric(row,months,m.key).value ?? "TBD"),
      row.kind === "section" ? "" : cashFlowMetric(row,months).value ?? "TBD", row.id, row.parent || "",row.depth,row.check ? "Reconciliation" : "Statement","provisional",
      JSON.stringify({ ...snapshot.source, revision:snapshot.id, source_row:row.source_row }),row.source_total ?? "",snapshot.reconciliation_note])];
}

import Decimal from "decimal.js";
import snapshot from "./data/spark-cash-flow-2026.v1.json" with { type: "json" };
import { yearMonths, type StatementLine, type Month } from "./prime-reports.ts";
import { metricAmount, type Metric } from "./financial.ts";

const D = Decimal.clone({ precision: 100 });
// Cached workbook totals can include blank inputs. Preserve their supplied
// amounts as known partial values instead of claiming complete coverage.
const dependencies: Record<string, string[]> = {
  "non-cash": ["token-incentives", "non-stable-gains", "non-stable-transfers", "other-non-cash"],
  receivables: ["earned-not-received", "sky-allocation-receipts", "sky-demand-receipts", "external-receipts"],
  payables: ["expenses-booked", "expenses-paid"],
  "net-operating": ["net-income", "non-cash", "receivables", "payables"],
  "net-investing": ["allocation-changes", "investments"],
  "net-financing": ["usds-drawn", "deposits", "sky-contributions", "buybacks"],
  "net-cash-change": ["net-operating", "net-investing", "net-financing"],
};

export function validateCashFlowSnapshot(input: unknown): typeof snapshot {
  const s = input as typeof snapshot;
  const check = (ok: unknown, message: string) => { if (!ok) throw new Error(`Cash flow snapshot: ${message}`); };
  check(s?.id === "spark-cash-flow-2026.v1" && s.prime === "spark" && s.year === 2026 && s.currency === "USD" && s.quality === "estimate", "invalid scope or quality");
  check(s.source?.sheet === "Cash Flow Statement - Spark" && /^[a-f0-9]{64}$/.test(s.source.sha256) && s.coverage_end === "2026-10-31", "invalid source or coverage");
  check(Array.isArray(s.rows) && s.rows.length === 33 && new Set(s.rows.map(r => r.id)).size === 33 && new Set(s.rows.map(r => r.source_row)).size === 33, "duplicate or missing rows");
  check([...Object.keys(dependencies), ...Object.values(dependencies).flat()].every(id => s.rows.some(r => r.id === id)), "missing formula component");
  const keys = Array.from({length:12},(_,i) => `2026-${String(i+1).padStart(2,"0")}`);
  const amount = (v: unknown) => v === null || (typeof v === "string" && /^-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/.test(v) && new D(v).isFinite());
  for (const row of s.rows) {
    check(typeof row.label === "string" && row.label.length && ["first","last","sum"].includes(row.aggregation) && [null,"section","subtotal","total"].includes(row.kind), "invalid row metadata");
    check(Object.keys(row.values).length === 12 && keys.every(k => k in row.values) && Object.values(row.values).every(amount) && amount(row.source_total), "invalid monthly amounts");
    if (row.parent) { const parent = s.rows.find(r => r.id === row.parent); check(parent && parent.depth + 1 === row.depth && parent.check === row.check, "invalid hierarchy"); }
    const values = Object.entries(row.values).filter(([m,v]) => m <= s.coverage_end.slice(0,7) && v !== null).map(([,v]) => v!);
    if (row.source_total !== null) {
      const control = row.aggregation === "first" ? values[0] : row.aggregation === "last" ? values.at(-1) : values.reduce((sum,v) => sum.plus(v),new D(0)).toString();
      check(control !== undefined && new D(control).minus(row.source_total).abs().lte("0.01"), "workbook total does not reconcile");
    }
  }
  return s;
}
export const cashFlowSnapshot = validateCashFlowSnapshot(snapshot);

export function cashFlowAsOf(months: Month[]): string {
  return [...months].reverse().find(m => m.cutoff)?.cutoff || `${snapshot.year - 1}-12-31`;
}
export function cashFlowCalendar(asOf?: string, now = new Date()): Month[] {
  const current = yearMonths(snapshot.year,now);
  if (!asOf) return current;
  const earliest = `${snapshot.year - 1}-12-31`;
  if (!/^\d{4}-\d\d-\d\d$/.test(asOf) || !Number.isFinite(Date.parse(asOf)) || new Date(asOf).toISOString().slice(0,10) !== asOf || asOf < earliest || asOf > cashFlowAsOf(current))
    throw new Error("Invalid cash flow cutoff; use a completed UTC day in the selected year");
  return yearMonths(snapshot.year, new Date(Date.parse(asOf) + 86400000));
}
export type CashFlowRow = typeof snapshot.rows[number];
export function cashFlowLayout(checks = false): StatementLine[] {
  return cashFlowSnapshot.rows.filter(r => r.check === checks).map(r => ({
    id: r.id, label: r.label, level: r.depth, parent: r.parent || undefined,
    kind: (r.kind || undefined) as StatementLine["kind"],
  }));
}
function missingInputs(row: CashFlowRow, key: string): string[] {
  if (row.values[key as keyof typeof row.values] == null) return [`${key}:${row.id}`];
  return (dependencies[row.id] || []).flatMap(id => missingInputs(cashFlowSnapshot.rows.find(r => r.id === id)!,key));
}
export function cashFlowMetric(row: CashFlowRow, months: Month[], month?: string): Metric {
  const eligible = months.filter(m => m.key.startsWith(`${snapshot.year}-`) && m.state === "complete" && m.cutoff && m.cutoff <= snapshot.coverage_end);
  // Stock metrics must use the required boundary, never an earlier/later known balance.
  const periods = month ? eligible.filter(m => m.key === month) : row.aggregation === "first" ? eligible.slice(0,1) : row.aggregation === "last" ? eligible.slice(-1) : eligible;
  const known = periods.filter(m => row.values[m.key as keyof typeof row.values] != null);
  const values = known.map(m => row.values[m.key as keyof typeof row.values]!);
  const value = values.length ? row.aggregation === "sum" && !month ? values.reduce((s,v) => s.plus(v), new D(0)).toString() : values[0] : null;
  const missing = periods.flatMap(m => missingInputs(row,m.key));
  const partial = value !== null && missing.length > 0;
  const future = !!month && months.find(m => m.key === month)?.state === "future";
  return { value: partial ? null : value, known_value: partial ? value : null,
    status: future ? "future" : partial ? "partial" : value !== null ? "available" : "unavailable",
    unit: "USD", quality: "estimate", recognition: "unknown", basis: "provisional_cash_flow_workbook_snapshot",
    reason: `Workbook figure; independent of live API income; reconciliation gaps unresolved${missing.length ? "; missing inputs: " + missing.join(", ") : ""}`,
    missing_components: missing,
    source_paths: known.map(m => `${snapshot.source.file}#${snapshot.source.sheet}!${String.fromCharCode(66 + Number(m.key.slice(5)))}${row.source_row}`) };
}
export function cashFlowCsvRows(year: number, months = yearMonths(year)): unknown[][] {
  if (year !== snapshot.year) return [];
  return [["Line item", ...months.map(m => `${m.label} ${year}`), "YTD", "Row ID", "Parent row ID", "Depth", "Section", "Quality", "Source", "Workbook total (control)", "Note", "Monthly coverage", "YTD coverage", "Missing inputs"],
    ...snapshot.rows.map(row => [row.label, ...months.map(m => row.kind === "section" ? "" : m.state === "future" ? "—" : metricAmount(cashFlowMetric(row,months,m.key)) ?? "TBD"),
      row.kind === "section" ? "" : metricAmount(cashFlowMetric(row,months)) ?? "TBD", row.id, row.parent || "",row.depth,row.check ? "Reconciliation" : "Statement","provisional",
      JSON.stringify({ ...snapshot.source, revision:snapshot.id, source_row:row.source_row, coverage_end:snapshot.coverage_end, as_of:cashFlowAsOf(months) }),row.source_total ?? "",snapshot.reconciliation_note,
      JSON.stringify(Object.fromEntries(months.map(m => [m.key,cashFlowMetric(row,months,m.key).status]))),cashFlowMetric(row,months).status,
      JSON.stringify({months:Object.fromEntries(months.map(m => [m.key,cashFlowMetric(row,months,m.key).missing_components])),total:cashFlowMetric(row,months).missing_components})])];
}

// Server-side dashboard composition. API publications and their hashes remain
// untouched; the additional expense snapshot has its own revision/display hash.
import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import raw from "./data/spark-expenses-2026.v1.json" with { type: "json" };
import groveRaw from "./data/grove-expenses-2026.v1.json" with { type: "json" };
import { metricAmount, type FinancialStatement, type Metric } from "./financial.ts";
import { statementLines, yearMonths, type Month } from "./prime-reports.ts";
import { statementFinancialLine } from "./statement-values.ts";
import type { Prime } from "./reporting.ts";

const D = Decimal.clone({ precision: 100 });
const POLICY = "dashboard.spark-expenses.v1";
const ROOTS = ["expenses.operating", "expenses.incentives", "expenses.distribution", "expenses.other"];
const months = Array.from({ length: 12 }, (_, i) => `2026-${String(i + 1).padStart(2, "0")}`);
type SourceLine = { id: string; label: string; parent: string | null; source_row: number; values: Record<string, string | null> };
export interface ExpenseSnapshot {
  schema_version: number; id: string; prime: string; year: number; currency: string;
  quality: string; status: string;
  source: { file: string; sheet: string; sha256: string };
  operating_basis: Record<string, string | null>;
  lines: SourceLine[];
}
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const check = (ok: unknown, message: string) => { if (!ok) throw new Error(`Expense snapshot: ${message}`); };
export function validateExpenseSnapshot(input: unknown): ExpenseSnapshot {
  const s = input as ExpenseSnapshot;
  check(s?.schema_version === 1 && ["spark","grove"].includes(s.prime) && s.year === 2026 && s.currency === "USD", "invalid perimeter");
  check(s.quality === "estimate" && s.status === "provisional_unverified", "must remain provisional");
  check(typeof s.id === "string" && new RegExp(`^${s.prime}-expenses-2026\\.v\\d+$`).test(s.id), "invalid snapshot version");
  check(s.operating_basis && Object.keys(s.operating_basis).length === 12 && months.every(m => m in s.operating_basis), "missing operating basis");
  check(s.source?.sheet === (s.prime==="spark" ? "Spark" : "Grove") && /^[a-f0-9]{64}$/.test(s.source.sha256), "missing workbook provenance");
  check(Array.isArray(s.lines) && s.lines.length === 22 && new Set(s.lines.map(l => l.id)).size === s.lines.length, "invalid line identities");
  const byId = new Map(s.lines.map(l => [l.id, l]));
  check([...ROOTS, "expenses.total", "expenses.compensation", "expenses.external_services"].every(id => byId.has(id)), "missing expense categories");
  for (const l of s.lines) {
    check(l.id.startsWith("expenses.") && typeof l.label === "string" && l.label.length > 0 && Number.isInteger(l.source_row) && l.source_row >= 6 && l.source_row <= 27, "invalid row");
    check(l.parent === null || byId.has(l.parent), "missing parent");
    check(Object.keys(l.values).length === 12 && months.every(m => m in l.values), "only 2026 monthly values are allowed");
    for (const v of Object.values(l.values)) check(v === null || (typeof v === "string" && /^-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/.test(v) && new D(v).isFinite()), "invalid amount");
    const seen = new Set([l.id]); let p = l.parent;
    while (p) { check(!seen.has(p), "cyclic hierarchy"); seen.add(p); p = byId.get(p)!.parent; }
  }
  // Imported parent rows are reconciliation controls. Calculations use disjoint
  // leaf values; cached spreadsheet subtotal rounding is below one cent.
  for (const l of s.lines) {
    const children = l.id === "expenses.total" ? ROOTS.map(id => byId.get(id)!) : s.lines.filter(c => c.parent === l.id);
    if (!children.length) continue;
    for (const m of months) {
      const known = children.filter(c => c.values[m] !== null);
      check((l.values[m] !== null) === (known.length === children.length), "subtotal coverage differs");
      if (l.values[m] !== null) check(known.reduce((v, c) => v.plus(c.values[m]!), new D(0)).minus(l.values[m]!).abs().lte("0.01"), "subtotal does not reconcile");
    }
  }
  return s;
}
const snapshot = validateExpenseSnapshot(raw);
export const expenseSnapshotRevision = hash(snapshot);
// Keep older immutable snapshots here when adding a later version, so exports
// continue to reproduce the exact expense data selected by an earlier screen.
const groveSnapshot=validateExpenseSnapshot(groveRaw);
export const groveExpenseSnapshotRevision=hash(groveSnapshot);
const snapshots = new Map([[expenseSnapshotRevision, snapshot],[groveExpenseSnapshotRevision,groveSnapshot]]);
export const expenseRevisionFor=(prime:Prime)=>prime==="spark" ? expenseSnapshotRevision : prime==="grove" ? groveExpenseSnapshotRevision : undefined;

function emptyMetric(future = false, reason = "expense_not_provided"): Metric {
  return { value: null, known_value: null, status: future ? "future" : "unavailable", unit: "USD", recognition: "accrual", basis: "provisional_workbook_expense", reason, source_paths: [], quality: "estimate" };
}
function combine(terms: { id: string; sign: 1 | -1; cell?: Metric }[], basis: string): Metric {
  const known = terms.filter(t => metricAmount(t.cell) !== null);
  const complete = terms.length > 0 && terms.every(t => t.cell?.status === "available");
  const sum = known.reduce((v, t) => v.plus(new D(metricAmount(t.cell)!).times(t.sign)), new D(0)).toString();
  return { ...emptyMetric(false, complete ? "provisional_dashboard_calculation" : "missing_expense_or_revenue_components"),
    value: complete ? sum : null, known_value: !complete && known.length ? sum : null,
    status: complete ? "available" : known.length ? "partial" : "unavailable", basis,
    source_paths: [...new Set(known.flatMap(t => t.cell!.source_paths))],
    source_refs: [...new Set(known.flatMap(t => [...(t.cell!.source_refs || []), ...(t.cell!.source_ref ? [t.cell!.source_ref] : [])]))],
    component_ids: terms.map(t => t.id), missing_components: terms.filter(t => t.cell?.status !== "available").map(t => t.id),
  };
}
function total(values: Record<string, Metric>, periods: FinancialStatement["periods"]): Metric {
  return combine(periods.filter(p => p.state !== "future").map(p => ({ id: p.key, sign: 1, cell: values[p.key] })), "dashboard_sum_of_matching_months");
}
function fallback(year: number, calendar: Month[], asOf?: string,prime:Prime="spark",policy=POLICY): FinancialStatement {
  const beforeYear = `${year - 1}-12-31`;
  const end = asOf || [...calendar].reverse().find(m => m.cutoff)?.cutoff || beforeYear;
  check((end.startsWith(`${year}-`) || end === beforeYear) && /^\d{4}-\d\d-\d\d$/.test(end) && Number.isFinite(Date.parse(end)) && new Date(end).toISOString().slice(0, 10) === end, "invalid expense report cutoff");
  const max = [...calendar].reverse().find(m => m.cutoff)?.cutoff || beforeYear;
  check(!!max && end <= max, "expense cutoff must be a completed day");
  const selected = yearMonths(year, new Date(Date.parse(end) + 86400000));
  return { schema_version: "3.0", policy_version: policy, prime, scope: "individual", year, as_of: end,
    report_hash: "", selection: "", total_label: selected.every(m => m.state === "complete") ? "FY" : "YTD",
    periods: selected.map(m => ({ key: m.key, state: m.state, actual_cutoff: null, expected_cutoff: m.cutoff, stale: false, financial_revision: null })),
    lines: [], source_manifest: {}, source_lag_periods: [],
  };
}

export function withPrimeExpenses(prime: Prime, year: number, input: FinancialStatement | null | undefined,
  calendar: Month[] = yearMonths(year), revision?:string, asOf?: string): FinancialStatement | null | undefined {
  if (!["spark","grove"].includes(prime) || year !== 2026) {
    if (revision !== undefined) throw new Error("Expense snapshot is unavailable for this prime/year");
    return input;
  }
  revision=revision ?? expenseRevisionFor(prime);
  if(!revision) throw new Error("Expense snapshot selection is unavailable");
  const policy=prime==="spark" ? POLICY : "dashboard.grove-expenses.v1";
  const selectedData = snapshots.get(revision);
  if (!selectedData) throw new Error("Expense snapshot is unavailable; refresh the dashboard");
  const data: ExpenseSnapshot = structuredClone(selectedData);
  // Contributor compensation is supplied once by the API's approved expense input.
  const contributor = prime === "spark" ? input?.lines.find(l=>l.id === "expenses.compensation.spk") : undefined;
  if (contributor) data.lines.push({id:contributor.id,label:contributor.label,parent:"expenses.compensation",source_row:7,
    values:Object.fromEntries(months.map(m=>[m,metricAmount(contributor.values[m])]))});
  check(data.prime===prime,"expense snapshot perimeter differs");
  check(!input?.dashboard_composition, "composition requires the original API input");
  check(!input || (input.prime === prime && input.year === year), "API input perimeter differs");
  const report = structuredClone(input || fallback(year, calendar, asOf,prime,policy));
  const originalRows = report.statement_rows || statementLines(prime, "individual", input).map(r => {
    const line = statementFinancialLine(input, r);
    if (line && !report.lines.some(l => l.id === line.id)) report.lines.push(structuredClone(line));
    return { id: r.id, label: r.label, parent: r.parent || null, depth: r.level, kind: r.kind || null, metric_id: line?.id || r.metricId || null };
  });
  const local = new Map<string, FinancialStatement["lines"][number]>();
  const build = (source: SourceLine): FinancialStatement["lines"][number] => {
    if (local.has(source.id)) return local.get(source.id)!;
    const children = source.id === "expenses.total" ? ROOTS.map(id => data.lines.find(l => l.id === id)!) : data.lines.filter(l => l.parent === source.id);
    const members = children.map(build);
    const values = Object.fromEntries(report.periods.map(p => {
      if (p.state === "future") return [p.key, emptyMetric(true, "future_period")];
      if (members.length) {
        const subtotal = combine(members.map(l => ({ id: l.id, sign: 1, cell: l.values[p.key] })), "provisional_expense_subtotal_from_disjoint_lines");
        if (source.source_row <= 18 && metricAmount(subtotal) !== null)
          subtotal.reason = `provisional_${data.operating_basis[p.key]}`;
        return [p.key, subtotal];
      }
      const end = new Date(Date.UTC(2026, Number(p.key.slice(5)), 0)).toISOString().slice(0, 10);
      const value = source.values[p.key];
      if (contributor && source.id === contributor.id && p.expected_cutoff && p.expected_cutoff >= end)
        return [p.key, structuredClone(contributor.values[p.key])];
      if (value == null || !p.expected_cutoff || p.expected_cutoff < end) return [p.key, emptyMetric(false, value == null ? "expense_not_provided" : "monthly_expense_after_selected_cutoff")];
      const basis = source.source_row <= 18 ? data.operating_basis[p.key] : "workbook_nonoperating_expense";
      const column = String.fromCharCode(74 + Number(p.key.slice(5)) - 1);
      return [p.key, { ...emptyMetric(), value, status: "available", basis: `provisional_${basis}`, reason: `provisional_${basis}`,
        source_ref: revision, source_paths: [`src/lib/data/${data.id}.json#${data.source.sheet}!${column}${source.source_row}`], period_start: p.key + "-01", period_end: end } satisfies Metric];
    }));
    const line = { id: source.id, label: source.label, aggregation: members.length ? "subtotal" as const : "leaf" as const,
      ...(members.length ? { components: members.map(l => ({ id: l.id, sign: 1 as const })) } : {}), values, total: total(values, report.periods) };
    local.set(source.id, line); return line;
  };
  data.lines.forEach(build);
  const expenses = local.get("expenses.total")!;
  const revenue = report.lines.find(l => l.id === "statement.net_revenue");
  const netValues = Object.fromEntries(report.periods.map(p => {
    if (p.state === "future") return [p.key, emptyMetric(true, "future_period")];
    const earned = revenue?.values[p.key], spent = expenses.values[p.key];
    // Missing expenses are never treated as zero, and annual net income is a
    // sum of matching monthly pairs, not unmatched annual revenue/expense sums.
    if (metricAmount(earned) === null || (contributor ? metricAmount(spent) === null : spent.status !== "available")) return [p.key, { ...emptyMetric(false, "revenue_or_expenses_missing"), missing_components: [...(metricAmount(earned) === null ? ["statement.net_revenue"] : []), ...(spent.status !== "available" ? ["expenses.total"] : [])] }];
    const expenseEnd = new Date(Date.UTC(year, Number(p.key.slice(5)), 0)).toISOString().slice(0, 10);
    const revenueEnd = earned?.period_end || p.actual_cutoff || p.expected_cutoff;
    if (!revenueEnd || revenueEnd < expenseEnd)
      return [p.key, { ...emptyMetric(false, "revenue_and_expense_cutoffs_differ"), missing_components: ["statement.net_revenue"] }];
    return [p.key, combine([{ id: "statement.net_revenue", sign: 1, cell: earned }, { id: "expenses.total", sign: -1, cell: spent }], "provisional_operational_net_revenue_less_workbook_expenses")];
  }));
  local.set("dashboard.net_income", { id: "dashboard.net_income", label: "Net income", aggregation: "subtotal",
    components: [{ id: "statement.net_revenue", sign: 1 }, { id: "expenses.total", sign: -1 }], values: netValues, total: total(netValues, report.periods) });
  report.lines = report.lines.filter(l=>!local.has(l.id));
  report.lines.push(...local.values());
  const expenseStart = originalRows.findIndex(r => r.id === "expenses");
  const layout = expenseStart >= 0 ? originalRows.slice(0, expenseStart) : originalRows.filter(r => r.id !== "net-income");
  layout.push({ id: "expenses", label: "Expenses", parent: null, depth: 0, kind: "section", metric_id: null });
  function append(source: SourceLine, depth: number) {
    const parent = source.parent;
    const rowId = source.id === "expenses.operating" ? "operating" : source.id === "expenses.incentives" ? "incentives" : source.id === "expenses.other" ? "other-expenses" : source.id === "expenses.distribution" ? "distribution" : source.id;
    const parentId = parent === "expenses.operating" ? "operating" : parent === "expenses.incentives" ? "incentives" : parent === "expenses.other" ? "other-expenses" : parent;
    layout.push({ id: rowId, label: source.label, parent: parentId, depth, kind: null, metric_id: source.id });
    // Staff-function amounts still feed calculations but are not display rows.
    if (!(prime === "spark" && depth >= 2))
      data.lines.filter(l => l.parent === source.id).forEach(l => append(l, depth + 1));
  }
  ROOTS.forEach(id => append(data.lines.find(l => l.id === id)!, 1));
  layout.push({ id: "noninterest-expense", label: "Total noninterest expense", parent: null, depth: 0, kind: "subtotal", metric_id: "expenses.total" },
    { id: "net-income", label: "Net income", parent: null, depth: 0, kind: "total", metric_id: "dashboard.net_income" });
  report.statement_rows = layout;
  report.dashboard_composition = { policy_version: policy, expense_revision: revision,
    expense_source: { ...data.source, data_file: `src/lib/data/${data.id}.json` },
    api_report_hash: input?.report_hash || null, api_selection: input?.selection || null,
    local_metric_ids: [...local.keys()], display_hash: hash({ policy, revision, api: input?.report_hash || null, as_of: report.as_of, lines: [...local.values()], layout }) };
  return report;
}

// Preserve callers and pinned Spark exports from the original expense import.
export const withSparkExpenses=withPrimeExpenses;

// Use the last supplied expense month for Spark's live income view. Pinned exports
// retain their selected API cutoff; advancing the sheet advances the live view.
export function expenseReportingCutoff(prime: Prime): string | undefined {
  if (prime !== "spark") return undefined;
  const available = months.filter(m=>snapshot.lines.filter(l=>l.id!=="expenses.total").every(l=>l.values[m]!==null));
  const last=available.at(-1);
  return last ? new Date(Date.UTC(2026,Number(last.slice(5)),0)).toISOString().slice(0,10) : undefined;
}

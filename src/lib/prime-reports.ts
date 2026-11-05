import { sparkStatementPolicies } from "./financial-policies.ts";
import { sheetStatementLines } from "./statement-layout.ts";
import type { FinancialStatement } from "./financial.ts";
import Decimal from "decimal.js";
import {
  amount,
  accruedIncome,
  name,
  PRIMES,
  type Prime,
  type ReadResult,
  type Venue,
} from "./reporting.ts";

export const API_DOC_URL =
  "https://github.com/soterlabs/settlement-cycle/blob/main/docs/pipeline/settlement-reporting-api.md";
export type Scope = "individual" | "group" | "combined";
export type View = "income" | "positions" | "cash-flow";
// Consolidated scopes are deliberately unavailable until attribution is supported.
export function individualScope(): Scope {
  return "individual";
}
export function individualReportHref(
  prime: Prime,
  search: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams({ scope: "individual" });
  for (const key of ["year", "view", "month"])
    if (typeof search[key] === "string") query.set(key, search[key]);
  return `/primes/${prime}?${query}`;
}
export const SCOPES: { key: Scope; label: string; description: string }[] = [
  {
    key: "individual",
    label: "Individual prime",
    description: "Prime-agent reporting",
  },
];
export interface Month {
  key: string;
  label: string;
  cutoff: string | null;
  state: "complete" | "partial" | "future";
}
export function reportingYear(value: string | undefined, now = new Date()) {
  const year = Number(value);
  return /^\d{4}$/.test(value || "") &&
    year >= 2020 &&
    year <= now.getUTCFullYear()
    ? year
    : now.getUTCFullYear();
}
export function yearMonths(year: number, now = new Date()): Month[] {
  const yesterday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  )
    .toISOString()
    .slice(0, 10);
  return Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
    const end = new Date(Date.UTC(year, index + 1, 0))
      .toISOString()
      .slice(0, 10);
    return {
      key,
      label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
      cutoff:
        key > yesterday.slice(0, 7) ? null : end > yesterday ? yesterday : end,
      state:
        key > yesterday.slice(0, 7)
          ? "future"
          : end > yesterday
            ? "partial"
            : "complete",
    };
  });
}
export function chooseMonth(months: Month[], requested?: string) {
  return (
    months.find((m) => m.key === requested) ||
    [...months].reverse().find((m) => m.cutoff !== null) ||
    months[0]
  );
}
export function totalLabel(months: Month[]) {
  return months.every((m) => m.state === "complete")
    ? `FY ${months[0].key.slice(0, 4)}`
    : `YTD ${months[0].key.slice(0, 4)}`;
}
export function annualAmount(
  values: (string | null)[],
  months: Month[],
): string | null {
  const required = months
    .map((m, index) => ({ m, value: values[index] }))
    .filter(({ m }) => m.cutoff !== null);
  if (!required.length || required.some(({ value }) => value == null))
    return null;
  return required
    .reduce((sum, { value }) => sum.plus(value!), new Decimal(0))
    .toString();
}
export interface StatementLine {
  id: string;
  label: string;
  level: number;
  kind?: "section" | "subtotal" | "total";
  parent?: string;
  structural?: boolean;
  sources?: string[];
  metricId?: string;
}
export function collapsedStatementGroups(rows: StatementLine[]) {
  return new Set(rows.flatMap((row) => (row.parent ? [row.parent] : [])));
}
export function statementLines(
  prime: Prime | null,
  scope: Scope,
  financial?: FinancialStatement | null,
): StatementLine[] {
  const apiLayout =
    prime === "spark" &&
    financial &&
    (sparkStatementPolicies.includes(financial.policy_version) || financial.dashboard_composition) &&
    financial.statement_rows;
  const rows: StatementLine[] = apiLayout
    ? apiLayout.map((r) => ({
        id: r.id,
        label: r.label,
        parent: r.parent || undefined,
        level: r.depth,
        kind: r.kind || undefined,
        metricId: r.metric_id || undefined,
      }))
    : sheetStatementLines(prime, scope, financial);
  if (apiLayout && financial) {
    if (
      financial.source_lag_periods.length ||
      financial.periods.some((p) => p.state !== "future" && p.stale)
    )
      return rows;
    const elapsed = financial.periods.filter((p) => p.state !== "future");
    const hidden = new Set<string>();
    for (const row of [...rows].reverse()) {
      if (row.kind === "section" || !row.metricId || !elapsed.length) continue;
      const source = financial.lines.find((l) => l.id === row.metricId);
      const children = rows.filter((r) => r.parent === row.id);
      if (
        source &&
        elapsed.every(
          (p) =>
            source.values[p.key]?.status === "available" &&
            source.values[p.key].value !== null &&
            new Decimal(source.values[p.key].value!).isZero(),
        ) &&
        children.every((c) => hidden.has(c.id))
      )
        hidden.add(row.id);
    }
    return rows.filter((r) => !hidden.has(r.id));
  }
  if (!financial || financial.source_lag_periods?.length) return rows;
  const elapsed = financial.periods.filter((p) => p.state !== "future");
  if (!elapsed.length || elapsed.some((p) => p.stale)) return rows;
  const hidden = new Set(
    rows
      .filter((row) => {
        if (row.id !== "gains" && row.parent !== "gains") return false;
        const source = financial.lines.find(
          (l) => l.id === (row.id === "gains" ? "statement.gains" : row.id),
        );
        return (
          source &&
          elapsed.every((p) => {
            const cell = source.values[p.key];
            return (
              cell?.status === "available" &&
              cell.quality !== "estimate" &&
              cell.recognition !== "unknown" &&
              cell.basis !== "unclassified" &&
              cell.value !== null &&
              new Decimal(cell.value).isZero()
            );
          })
        );
      })
      .map((row) => row.id),
  );
  // Unknown children remain visible even if an inconsistent parent says zero.
  if (rows.some((row) => row.parent === "gains" && !hidden.has(row.id)))
    hidden.delete("gains");
  return rows.filter((row) => !hidden.has(row.id));
}

export interface MonthReport {
  month: Month;
  read: ReadResult;
  actualCutoff: string | null;
}
export interface PortfolioRow {
  prime: Prime;
  venue: Venue;
  actualCutoff: string;
  revision: string;
}
export function sourceRows(
  reads: { prime: Prime; read: ReadResult }[],
): PortfolioRow[] {
  return reads.flatMap(
    ({ prime, read }) =>
      read.report?.data.result.venues
        .filter((v) => v.enabled)
        .map((venue) => ({
          prime,
          venue,
          actualCutoff: read.report!.data.cutoff,
          revision: read.report!.data.revision_id,
        })) || [],
  );
}
export function sourceCatalog(monthly: MonthReport[]): Venue[] {
  // Saved publications only; never infer historical allocations from current configuration.
  const rows = new Map<string, Venue>();
  for (const r of monthly)
    for (const v of r.read.report?.data.result.venues || [])
      if (v.enabled) rows.set(v.venue_id, v);
  return [...rows.values()];
}
export function sourceIncome(read: ReadResult, id: string, accrual = false) {
  const row = read.report?.data.result.venues.find((v) => v.venue_id === id);
  return row
    ? accrual
      ? accruedIncome(row)
      : amount(row, "income_usd")
    : null;
}
export function scopeTitle(prime: Prime | null, scope: Scope) {
  return scope === "combined"
    ? "Combined prime agents"
    : `${name(prime || "spark")}${scope === "group" ? " group" : ""}`;
}
export function parsePrime(value: string | null | undefined): Prime | null {
  return PRIMES.includes(value as Prime) ? (value as Prime) : null;
}

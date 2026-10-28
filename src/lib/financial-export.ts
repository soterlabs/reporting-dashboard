import {
  financialLine,
  statementMonths,
  statementTotalLabel,
  type FinancialPortfolio,
  type FinancialRead,
  type FinancialStatement,
  type Metric,
} from "./financial.ts";
import {
  statementLines,
  totalLabel,
  type Month,
  type Scope,
} from "./prime-reports.ts";
import type { Prime } from "./reporting.ts";

export function statementCsvRows(
  prime: Prime,
  scope: Scope,
  year: number,
  selectedMonth: string,
  calendarMonths: Month[],
  report?: FinancialStatement | null,
): unknown[][] {
  const months = statementMonths(report, calendarMonths);
  return [
    [
      "Scope",
      "Prime agent",
      "Line item",
      ...months.map(
        (m) =>
          `${m.label} ${year}${m.state === "partial" ? " MTD" : m.state === "future" ? " future" : ""}`,
      ),
      statementTotalLabel(report, totalLabel(months)),
      "Accounting basis",
      "Actual monthly cutoffs UTC",
      "Financial report hash",
      "Financial report selection",
      "Source manifest",
    ],
    ...statementLines(scope === "combined" ? null : prime, scope).map((row) => {
      const line = financialLine(report, row.id);
      return [
        scope,
        scope === "combined" ? "All prime agents" : prime,
        row.label,
        ...months.map((m) =>
          row.kind === "section" ? "" : (line?.values[m.key]?.value ?? "TBD"),
        ),
        row.kind === "section" ? "" : (line?.total.value ?? "TBD"),
        (line
          ? [
              ...new Set(
                Object.values(line.values)
                  .filter((v) => v.status === "available")
                  .map((v) => v.basis),
              ),
            ].join("; ")
          : "") ||
          line?.values[selectedMonth]?.reason ||
          "Classification or inputs not yet available",
        JSON.stringify(
          report?.periods.map((p) => ({
            month: p.key,
            cutoff: p.actual_cutoff,
          })) || [],
        ),
        report?.report_hash,
        report?.selection,
        JSON.stringify(report?.source_manifest || {}),
      ];
    }),
  ];
}

export const FINANCIAL_EXPORT_HEADERS = [
  "Record type",
  "Financial revision",
  "Financial report hash",
  "Financial policy",
  "Financial source revision",
  "Financial source result hash",
  "Financial cutoff UTC",
  "Financial refresh status",
  "Recognition basis",
  "Known portion closing value USD",
  "Perimeter ID",
  "Expected position IDs",
  "Excluded venue IDs",
];
export function financialExportMetadata(
  read: FinancialRead<FinancialPortfolio> | null,
  kind: "position" | "portfolio_summary",
  metric?: Metric,
): unknown[] {
  const report = read?.report;
  return [
    kind,
    report?.financial_revision,
    report?.report_hash,
    report?.policy_version,
    report?.source.revision_id,
    report?.source.result_hash,
    report?.cutoff,
    read?.retained
      ? "Refresh failed; retained financial publication"
      : report?.source_lag
        ? "Newer source awaiting financial publication"
        : report?.freshness.stale
          ? "Delayed financial publication"
          : report
            ? "Published"
            : read?.message || "Unavailable",
    metric?.basis,
    kind === "portfolio_summary"
      ? report?.portfolio.closing_value.known_value
      : "",
    report?.portfolio.perimeter_id,
    report?.portfolio.expected_position_ids.join("; "),
    report?.portfolio.excluded_source_venue_ids.join("; "),
  ];
}
export function portfolioSummaryCsv(
  scope: Scope,
  prime: Prime,
  month: string,
  read: FinancialRead<FinancialPortfolio> | null,
  sourceMetadata: unknown[],
): unknown[] {
  const doc = read?.report;
  const closing = doc?.portfolio.closing_value;
  return [
    scope,
    "Reviewed tracked allocations; entity assets and NAV unavailable",
    prime,
    month,
    doc?.cutoff,
    "Tracked allocations (portfolio summary)",
    doc?.portfolio.opening_value.value,
    closing?.value,
    ...Array(6).fill(null),
    closing?.status || "unavailable",
    closing?.reason ||
      read?.message ||
      (doc ? "" : "Financial publication unavailable for the selected screen"),
    ...sourceMetadata,
    ...financialExportMetadata(read, "portfolio_summary", closing),
  ];
}

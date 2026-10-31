import {
  financialLine,
  statementMonths,
  statementTotalLabel,
  positionAccruedIncome,
  metricExplanation,
  metricAmount,
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
  type PortfolioRow,
} from "./prime-reports.ts";
import { amount, loanIncomeBalances, type Prime } from "./reporting.ts";

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
        (m) => `${m.label} ${year}${m.state === "partial" ? " MTD" : ""}`,
      ),
      statementTotalLabel(report, totalLabel(months)),
      "Accounting basis",
      "Actual monthly cutoffs UTC",
      "Financial report hash",
      "Financial report selection",
      "Source manifest",
      "Monthly metric source references",
      "Monthly coverage",
      "Monthly known components USD",
      "Total coverage",
      "Total known components USD",
      "Coverage explanation",
    ],
    ...statementLines(scope === "combined" ? null : prime, scope, report).map(
      (row) => {
        const line = financialLine(report, row.id);
        return [
          scope,
          scope === "combined" ? "All prime agents" : prime,
          row.label,
          ...months.map((m) =>
            row.kind === "section" || row.structural
              ? ""
              : m.state === "future"
                ? "—"
                : (metricAmount(line?.values[m.key]) ?? "TBD"),
          ),
          row.kind === "section" || row.structural
            ? ""
            : (metricAmount(line?.total) ?? "TBD"),
          (line
            ? [
                ...new Set(
                  Object.values(line.values)
                    .filter((v) => v.value !== null || v.known_value !== null)
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
          JSON.stringify(
            Object.fromEntries(
              months.map((m) => [
                m.key,
                line?.values[m.key]?.source_refs ||
                  line?.values[m.key]?.source_ref ||
                  null,
              ]),
            ),
          ),
          JSON.stringify(
            Object.fromEntries(
              months.map((m) => [
                m.key,
                line?.values[m.key]?.status || "unavailable",
              ]),
            ),
          ),
          JSON.stringify(
            Object.fromEntries(
              months.map((m) => [
                m.key,
                line?.values[m.key]?.known_value ?? null,
              ]),
            ),
          ),
          line?.total.status || "unavailable",
          line?.total.known_value ?? "",
          JSON.stringify({
            months: Object.fromEntries(
              months.map((m) => [
                m.key,
                metricExplanation(line?.values[m.key], report),
              ]),
            ),
            total: metricExplanation(line?.total, report),
          }),
        ];
      },
    ),
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
  "Source venue ID",
  "Position ID",
];
export function financialExportMetadata(
  read: FinancialRead<FinancialPortfolio> | null,
  kind: "position" | "portfolio_summary",
  metric?: Metric,
  member?: { sourceVenueId: string; positionId?: string },
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
    member?.sourceVenueId || "",
    member?.positionId || "",
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
    metricAmount(closing),
    ...Array(6).fill(null),
    closing?.status || "unavailable",
    closing?.reason ||
      read?.message ||
      (doc ? "" : "Financial publication unavailable for the selected screen"),
    ...sourceMetadata,
    ...financialExportMetadata(read, "portfolio_summary", closing),
  ];
}

export function positionCsvRow(
  scope: Scope,
  month: string,
  row: PortfolioRow,
  financial: FinancialRead<FinancialPortfolio> | null,
  sourceMetadata: unknown[],
): unknown[] {
  const v = row.venue;
  const position = financial?.report?.portfolio.positions.find(
    (p) => p.source_venue_id === v.venue_id,
  );
  const income =
    position?.income ||
    financial?.report?.claims?.find((p) => p.source_venue_id === v.venue_id)
      ?.income;
  return [
    scope,
    "Unconsolidated source position; entity attribution unconfirmed",
    row.prime,
    month,
    row.actualCutoff,
    v.label,
    amount(v, "opening_position_value_usd"),
    amount(v, "position_value_usd"),
    positionAccruedIncome(financial?.report, v),
    loanIncomeBalances(v).interestReceivable,
    loanIncomeBalances(v).incomeReceivedInAdvance,
    amount(v, "cash_received_usd"),
    "TBD",
    "TBD",
    v.status,
    v.reason || "",
    ...sourceMetadata,
    ...financialExportMetadata(financial, "position", income, {
      sourceVenueId: v.venue_id,
      positionId: position?.position_id,
    }),
  ];
}

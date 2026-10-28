import { financialStatements, financialPortfolio } from "@/lib/api";
import { financialLine } from "@/lib/financial";
import { annualReports, portfolioReports } from "@/lib/report-data";
import {
  chooseMonth,
  parsePrime,
  reportingYear,
  sourceCatalog,
  sourceIncome,
  sourceRows,
  statementLines,
  totalLabel,
  yearMonths,
  type Scope,
} from "@/lib/prime-reports";
import { amount, loanIncomeBalances } from "@/lib/reporting";
export const dynamic = "force-dynamic";
function cell(value: unknown) {
  const text = String(value ?? "TBD");
  const safe =
    /^[\s]*[=+@]/.test(text) || /^-\D/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams;
  const prime = parsePrime(q.get("prime")) || "spark";
  const scope: Scope =
    q.get("scope") === "combined"
      ? "combined"
      : q.get("scope") === "group"
        ? "group"
        : "individual";
  const year = reportingYear(q.get("year") || undefined);
  const months = yearMonths(year);
  const month = chooseMonth(months, q.get("month") || undefined);
  const positions = q.get("view") === "positions";
  const source = q.get("dataset") === "source";
  const rows: unknown[][] = [];
  if (positions) {
    const reports = await portfolioReports(prime, scope, month);
    rows.push([
      "Requested scope",
      "Data basis",
      "Prime agent",
      "Reporting month",
      "Actual cutoff UTC",
      "Investment",
      "Opening position value USD",
      "Closing position value USD",
      "Income earned accrual basis MTD USD",
      "Interest receivable USD",
      "Income received in advance USD",
      "Cash income received MTD USD",
      "Interest expense USD",
      "Net investment yield",
      "Status",
      "Reason",
      "Revision",
      "View hash",
      "Source result hash",
      "Computed at",
      "API checked at",
      "Publication freshness",
      "Excluded inputs",
    ]);
    for (const p of reports) {
      const financial =
        scope === "individual" && p.read.report
          ? await financialPortfolio(
              p.prime,
              month.key,
              p.read.report.data.revision_id,
              p.actualCutoff || undefined,
            )
          : null;
      const publishedRows = sourceRows([p]);
      const metadata = [
        p.read.report?.data.revision_id,
        p.read.report?.data.view_hash,
        p.read.report?.data.source_result_hash,
        p.read.report?.data.computed_at,
        p.read.verifiedAt,
        p.read.retained
          ? "Refresh failed; retained publication"
          : p.read.report?.freshness.stale
            ? "Delayed publication"
            : p.read.report
              ? "Published"
              : "TBD",
        p.read.report?.data.excluded_inputs.join("; "),
      ];
      if (!publishedRows.length)
        rows.push([
          scope,
          "Unconsolidated source portfolio; entity attribution unconfirmed",
          p.prime,
          month.key,
          p.actualCutoff,
          "TBD",
          ...Array(8).fill("TBD"),
          "TBD",
          p.read.message || "No enabled source positions",
          ...metadata,
        ]);
      for (const { venue: v } of publishedRows)
        rows.push([
          scope,
          "Unconsolidated source position; entity attribution unconfirmed",
          p.prime,
          month.key,
          p.actualCutoff,
          v.label,
          amount(v, "opening_position_value_usd"),
          amount(v, "position_value_usd"),
          financial?.report?.portfolio.positions.find(
            (p) => p.source_venue_id === v.venue_id,
          )?.income.value ??
            (v.method === "loan_accrual" ? amount(v, "income_usd") : null),
          loanIncomeBalances(v).interestReceivable,
          loanIncomeBalances(v).incomeReceivedInAdvance,
          amount(v, "cash_received_usd"),
          "TBD",
          "TBD",
          v.status,
          v.reason || p.read.message || "",
          ...metadata,
        ]);
    }
  } else if (source) {
    if (scope !== "individual")
      return Response.json(
        {
          error:
            "Annual source schedule is available for individual primes only",
        },
        { status: 400 },
      );
    const annual = await annualReports(prime, year);
    rows.push([
      "Prime agent",
      "Reporting month",
      "Actual cutoff UTC",
      "Investment",
      "Reported income MTD USD",
      "Income accrual basis MTD USD",
      "Recognition method",
      "Status",
      "Revision",
      "View hash",
      "Source result hash",
      "Computed at",
      "API checked at",
      "Refresh status",
      "Excluded inputs",
    ]);
    const catalog = sourceCatalog(annual);
    for (const r of annual) {
      if (!catalog.length)
        rows.push([
          prime,
          r.month.key,
          r.actualCutoff,
          "TBD",
          "TBD",
          "TBD",
          "TBD",
          r.read.message || "TBD",
          r.read.report?.data.revision_id,
          r.read.report?.data.view_hash,
          r.read.report?.data.source_result_hash,
          r.read.report?.data.computed_at,
          r.read.verifiedAt,
          r.read.message || "API response checked",
          r.read.report?.data.excluded_inputs.join("; "),
        ]);
      for (const v of catalog)
        rows.push([
          prime,
          r.month.key,
          r.actualCutoff,
          v.label,
          sourceIncome(r.read, v.venue_id),
          sourceIncome(r.read, v.venue_id, true),
          r.read.report?.data.result.venues.find(
            (row) => row.venue_id === v.venue_id,
          )?.method,
          r.read.report?.data.result.venues.find(
            (row) => row.venue_id === v.venue_id,
          )?.status,
          r.read.report?.data.revision_id,
          r.read.report?.data.view_hash,
          r.read.report?.data.source_result_hash,
          r.read.report?.data.computed_at,
          r.read.verifiedAt,
          r.read.message || "API response checked",
          r.read.report?.data.excluded_inputs.join("; "),
        ]);
    }
  } else {
    const financial =
      scope === "individual"
        ? await financialStatements(
            prime,
            year,
            q.get("financial_revision") || undefined,
          )
        : null;
    if (q.get("financial_revision") && !financial?.report)
      return Response.json(
        {
          error: financial?.message || "Retained financial report unavailable",
        },
        { status: 503 },
      );
    rows.push([
      "Scope",
      "Prime agent",
      "Line item",
      ...months.map(
        (m) =>
          `${m.label} ${year}${m.state === "partial" ? " MTD" : m.state === "future" ? " future" : ""}`,
      ),
      totalLabel(months),
      "Accounting basis",
      "Actual monthly cutoffs UTC",
      "Financial report hash",
      "Financial report selection",
      "Source manifest",
    ]);
    for (const r of statementLines(scope === "combined" ? null : prime, scope))
      rows.push([
        scope,
        scope === "combined" ? "All prime agents" : prime,
        r.label,
        ...months.map((m) =>
          r.kind === "section"
            ? ""
            : (financialLine(financial?.report, r.id)?.values[m.key]?.value ??
              "TBD"),
        ),
        r.kind === "section"
          ? ""
          : (financialLine(financial?.report, r.id)?.total.value ?? "TBD"),
        financialLine(financial?.report, r.id)?.values[month.key]?.basis ||
          "Classification or inputs not yet available",
        JSON.stringify(
          financial?.report?.periods.map((p) => ({
            month: p.key,
            cutoff: p.actual_cutoff,
          })) || [],
        ),
        financial?.report?.report_hash,
        financial?.report?.selection,
        JSON.stringify(financial?.report?.source_manifest || {}),
      ]);
  }
  return new Response(
    "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n"),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${scope === "combined" ? "combined-primes" : prime}-${scope}-${positions ? `positions-${month.key}` : source ? `source-income-${year}` : `income-statement-${year}`}.csv"`,
        "Cache-Control": "no-store",
      },
    },
  );
}

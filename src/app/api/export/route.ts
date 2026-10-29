import { financialPortfolioRows } from "@/lib/financial";
import { financialStatements, financialPortfolio, report } from "@/lib/api";
import {
  FINANCIAL_EXPORT_HEADERS,
  financialExportMetadata,
  portfolioSummaryCsv,
  positionCsvRow,
  statementCsvRows,
} from "@/lib/financial-export";
import { annualReports, portfolioReports } from "@/lib/report-data";
import {
  chooseMonth,
  parsePrime,
  reportingYear,
  sourceCatalog,
  sourceIncome,
  sourceRows,
  yearMonths,
  type Scope,
} from "@/lib/prime-reports";
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
    const sourceRevision = q.get("source_revision");
    const sourceCutoff = q.get("source_cutoff");
    const portfolioRevision = q.get("portfolio_revision");
    if (scope !== "individual" && (sourceRevision || portfolioRevision))
      return Response.json(
        { error: "Revision selections require individual scope" },
        { status: 400 },
      );
    if (
      portfolioRevision &&
      portfolioRevision !== "none" &&
      !/^[a-f0-9]{64}$/.test(portfolioRevision)
    )
      return Response.json(
        { error: "Invalid financial portfolio revision" },
        { status: 400 },
      );
    let reports;
    if (sourceRevision) {
      if (
        sourceRevision !== "none" &&
        (!/^[a-f0-9]{64}$/.test(sourceRevision) ||
          !sourceCutoff ||
          !/^\d{4}-\d{2}-\d{2}$/.test(sourceCutoff) ||
          sourceCutoff.slice(0, 7) !== month.key)
      )
        return Response.json(
          { error: "Invalid retained source selection" },
          { status: 400 },
        );
      const read =
        sourceRevision === "none"
          ? {
              report: null,
              retained: false,
              verifiedAt: null,
              message: "No source publication in the selected screen",
            }
          : await report(prime, sourceCutoff!, sourceRevision);
      if (sourceRevision !== "none" && !read.report)
        return Response.json({ error: read.message }, { status: 503 });
      reports = [
        { prime, month, read, actualCutoff: read.report?.data.cutoff || null },
      ];
    } else reports = await portfolioReports(prime, scope, month);
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
      ...FINANCIAL_EXPORT_HEADERS,
    ]);
    for (const p of reports) {
      const financial =
        scope === "individual" && month.cutoff && portfolioRevision !== "none"
          ? await financialPortfolio(
              p.prime,
              month.key,
              p.read.report?.data.revision_id,
              p.actualCutoff || undefined,
              portfolioRevision || undefined,
            )
          : null;
      if (
        portfolioRevision &&
        portfolioRevision !== "none" &&
        !financial?.report
      )
        return Response.json(
          {
            error:
              financial?.message || "Retained financial portfolio unavailable",
          },
          { status: 503 },
        );
      const publishedRows = financialPortfolioRows(
        p.prime,
        sourceRows([p]),
        financial?.report,
      );
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
      if (scope === "individual")
        rows.push(
          portfolioSummaryCsv(scope, p.prime, month.key, financial, metadata),
        );
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
          ...financialExportMetadata(financial, "position"),
        ]);
      for (const row of publishedRows)
        rows.push(positionCsvRow(scope, month.key, row, financial, metadata));
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
    rows.push(
      ...statementCsvRows(
        prime,
        scope,
        year,
        month.key,
        months,
        financial?.report,
      ),
    );
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

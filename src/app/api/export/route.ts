import {balanceSheetCsv} from "@/lib/balance-sheet";
import {balanceSheetReport} from "@/lib/api";
import { cashFlowApiCsv } from "@/lib/cash-flow-api";
import { financialPortfolioRows } from "@/lib/financial";
import { cashFlowCsvRows, cashFlowSnapshot, cashFlowCalendar } from "@/lib/cash-flow";
import { withPrimeExpenses } from "@/lib/spark-expenses";
import { financialStatements, financialPortfolio, report, cashFlowReport } from "@/lib/api";
import {
  FINANCIAL_EXPORT_HEADERS,
  financialExportMetadata,
  portfolioSummaryCsv,
  positionCsvRow,
  statementCsvRows,
  offchainCsvRows,
  archiveCsvRows,
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
  if (scope !== "individual")
    return Response.json(
      {
        error:
          "Group and combined exports are unavailable. Open an individual prime report.",
      },
      { status: 410 },
    );
  const year = reportingYear(q.get("year") || undefined);
  const months = yearMonths(year);
  const month = chooseMonth(months, q.get("month") || undefined);
  if (q.get("view") === "balance-sheet") {
    if (prime !== "spark" || year !== 2026 || (q.has("prime") && q.get("prime") !== "spark") || (q.has("year") && q.get("year") !== "2026") || q.has("dataset")) return Response.json({error:"Balance sheet supports Spark 2026"},{status:404});
    const selection=q.get("balance_sheet_selection");
    if (selection === "none") return Response.json({error:"No balance sheet publication selected"},{status:503});
    const read=await balanceSheetReport(prime,year,selection||undefined);
    if (!read.report) return Response.json({error:read.message||"Balance sheet unavailable"},{status:503});
    return new Response("\uFEFF"+balanceSheetCsv(read.report).map(row=>row.map(cell).join(",")).join("\r\n"),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="spark-balance-sheet-${year}.csv"`,"Cache-Control":"no-store"}});
  }
  const positions = q.get("view") === "positions";
  const source = q.get("dataset") === "source";
  const offchain = q.get("dataset") === "offchain";
  const archive = q.get("dataset") === "archive";
  const rows: unknown[][] = [];
  const cashFlow = q.get("view") === "cash-flow";
  if (cashFlow) {
    if (q.has("cash_flow_selection") && (q.has("cash_flow_revision") || q.has("cash_flow_as_of"))) return Response.json({error:"Select API revisions or a workbook snapshot, not both"},{status:400});
    if (prime !== "spark" || year !== cashFlowSnapshot.year || (q.has("prime") && q.get("prime") !== "spark") || (q.has("year") && q.get("year") !== String(cashFlowSnapshot.year)) || q.has("dataset"))
      return Response.json({ error: "Cash flow workbook data is only available for Spark 2026" }, { status: 404 });
    if (!q.has("cash_flow_revision")) {
      const selected=q.get("cash_flow_selection");
      if(selected==="none") return Response.json({error:"No cash-flow API publication was selected"},{status:503});
      const read=await cashFlowReport(prime,year,selected || undefined);
      if(!read.report) return Response.json({error:read.message || "Cash-flow API unavailable"},{status:503});
      rows.push(...cashFlowApiCsv(read.report));
    } else {
    if (q.has("cash_flow_revision") && q.get("cash_flow_revision") !== cashFlowSnapshot.id)
      return Response.json({ error: "Cash flow snapshot unavailable; refresh the dashboard" }, { status: 409 });
    if (q.has("cash_flow_revision") && !q.get("cash_flow_as_of"))
      return Response.json({ error: "Pinned cash flow exports require a cutoff" }, { status: 400 });
    try {
      rows.push(...cashFlowCsvRows(year, cashFlowCalendar(q.get("cash_flow_as_of") || undefined)));
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Invalid cash flow cutoff" }, { status: 400 });
    }
    }
  } else if (positions) {
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
  } else if (offchain || archive) {
    const financial = await financialStatements(
      prime,
      year,
      q.get("financial_revision") || undefined,
    );
    if (!financial.report)
      return Response.json(
        { error: financial.message || "Financial report unavailable" },
        { status: 503 },
      );
    rows.push(
      ...(archive
        ? archiveCsvRows(financial.report)
        : offchainCsvRows(financial.report)),
    );
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
    const selected = q.get("financial_revision");
    const expenseRevision = q.get("expense_revision");
    const expenseAsOf = q.get("expense_as_of");
    const displayHash = q.get("display_hash");
    const totalsThrough = q.get("totals_through");
    if ((totalsThrough && !expenseRevision) || (expenseRevision && (!["spark","grove"].includes(prime) || year !== 2026 || !/^[a-f0-9]{64}$/.test(expenseRevision))) ||
        (selected === "none" && (!expenseRevision || !expenseAsOf)) ||
        (displayHash && (!expenseRevision || !/^[a-f0-9]{64}$/.test(displayHash))))
      return Response.json({ error: "Invalid expense selection" }, { status: 400 });
    const financial = selected === "none" ? null : await financialStatements(prime, year, selected || undefined);
    if (selected && selected !== "none" && !financial?.report)
      return Response.json({ error: financial?.message || "Retained financial report unavailable" }, { status: 503 });
    let statement = financial?.report;
    // Old saved API-only exports have no expense revision and stay API-only.
    // New screen downloads pin both their API input (including absence) and
    // their immutable local expense snapshot.
    if (expenseRevision || !selected) {
      try {
        if (expenseAsOf && statement && expenseAsOf !== statement.as_of)
          throw new Error("Financial and expense cutoffs differ");
        statement = withPrimeExpenses(prime, year, statement, months, expenseRevision || undefined, expenseAsOf || undefined, totalsThrough || undefined) || null;
        if (displayHash && statement?.dashboard_composition?.display_hash !== displayHash)
          throw new Error("Dashboard composition changed; refresh the dashboard before exporting");
      } catch (error) {
        return Response.json({ error: error instanceof Error ? error.message : "Expense selection unavailable" }, { status: 409 });
      }
    }
    rows.push(...statementCsvRows(prime, scope, year, month.key, months, statement));
  }
  return new Response(
    "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n"),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${prime}-${scope}-${cashFlow ? `cash-flow-${year}` : positions ? `positions-${month.key}` : archive ? `archive-income-${year}` : offchain ? `offchain-accruals-${year}` : source ? `source-income-${year}` : `income-statement-${year}`}.csv"`,
        "Cache-Control": "no-store",
      },
    },
  );
}

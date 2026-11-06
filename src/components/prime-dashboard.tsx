import {
  financialPortfolioRows,
  positionAccruedIncome,
  metricAmount,
} from "@/lib/financial";
import { financialStatements, financialPortfolio, cashFlowReport } from "@/lib/api";
import { ReportingShell } from "./reporting-shell";
import { CashFlowStatement } from "./cash-flow-statement";

import { withPrimeExpenses } from "@/lib/spark-expenses";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Building2,
  ChevronRight,
  CircleHelp,
  FileText,
} from "lucide-react";
import { Controls, ReportingMonthSelect } from "@/app/controls";
import { FinancialNumber, FinancialLegend } from "./financial-number";
import { venueEvidence, readUncertainty } from "@/lib/number-confidence";
import { ArchiveIncome } from "./archive-income";
import { OffchainAccruals } from "./offchain-accruals";
import { IncomeStatement } from "./income-statement";
import { ReportingRefresh } from "./reporting-refresh";
import { annualReports, portfolioReports } from "@/lib/report-data";
import {
  API_DOC_URL,
  individualScope,
  chooseMonth,
  scopeTitle,
  sourceRows,
  statementLines,
  yearMonths,
  type Scope,
  type View,
} from "@/lib/prime-reports";
import {
  amount,
  cleanLabel,
  loanIncomeBalances,
  name,
  PRIMES,
  type Prime,
} from "@/lib/reporting";

export type Search = Record<string, string | string[] | undefined>;
const param = (s: Search, key: string) =>
  typeof s[key] === "string" ? (s[key] as string) : undefined;
const date = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

export function reportHref(
  prime: Prime,
  _scope: Scope,
  view: View,
  year: number,
  month: string,
) {
  const query = new URLSearchParams({
    prime,
    scope: "individual",
    view,
    year: String(year),
    month,
  });
  return `/primes/${prime}?${query}`;
}
export async function PrimeDashboard({
  prime = "spark",
  combined = false,
  search,
}: {
  prime?: Prime;
  combined?: boolean;
  search: Search;
}) {
  const scope: Scope = individualScope();
  const view: View =
    param(search, "view") === "reconciliation" ? "reconciliation" :
    param(search, "view") === "cash-flow" ? "cash-flow" :
    param(search, "view") === "positions" ? "positions" : "income";
  const cashView = view === "cash-flow" || view === "reconciliation";
  const year = 2026;
  const months = yearMonths(year);
  const month = chooseMonth(months, param(search, "month"));
  const title = scopeTitle(prime, scope);
  const cashFlow = cashView && prime === "spark" && year === 2026 ? await cashFlowReport(prime,year) : null;
  // Financial components are independent of the unclassified source schedule.
  const annual =
    view === "income" && scope === "individual"
      ? await annualReports(prime, year)
      : [];
  const fromAnnual = annual.find((r) => r.month.key === month.key);
  const portfolios = cashView ? [] : fromAnnual
    ? [{ prime, ...fromAnnual }]
    : await portfolioReports(prime, scope, month);
  const apiFinancial =
    scope === "individual" && view === "income"
      ? await financialStatements(prime, year)
      : null;
  const financial = apiFinancial
    ? { ...apiFinancial, report: withPrimeExpenses(prime, year, apiFinancial.report, months) || null }
    : null;
  const sourcePortfolio = portfolios[0];
  const positionFinancial =
    scope === "individual" && view === "positions" && month.cutoff
      ? await financialPortfolio(
          prime,
          month.key,
          sourcePortfolio?.read.report?.data.revision_id,
          sourcePortfolio?.actualCutoff || undefined,
        )
      : null;
  const rows = financialPortfolioRows(
    prime,
    sourceRows(portfolios),
    positionFinancial?.report,
  );
  const query = new URLSearchParams({
    prime,
    scope,
    view: view === "reconciliation" ? "cash-flow" : view,
    year: String(year),
    month: month.key,
  });
  if (cashView) {
    query.set("cash_flow_selection",cashFlow?.report?.selection || "none");
  }
  if (financial?.report)
    query.set("financial_revision", financial.report.selection);
  if (financial?.report?.dashboard_composition) {
    query.set("expense_revision", financial.report.dashboard_composition.expense_revision);
    query.set("financial_revision", financial.report.dashboard_composition.api_selection || "none");
    query.set("expense_as_of", financial.report.as_of);
    query.set("display_hash", financial.report.dashboard_composition.display_hash);
  }
  if (view === "positions" && scope === "individual") {
    query.set(
      "source_revision",
      sourcePortfolio?.read.report?.data.revision_id || "none",
    );
    if (sourcePortfolio?.actualCutoff)
      query.set("source_cutoff", sourcePortfolio.actualCutoff);
    query.set(
      "portfolio_revision",
      positionFinancial?.report?.financial_revision || "none",
    );
  }
  return (
    <ReportingShell>
      <ReportingRefresh />
      <aside className="sidebar" id="reporting-sidebar">
        <Link href="/" className="brand" aria-label="Soter Labs home">
          <img
            className="brand-mark"
            src="/soter-labs.png"
            width="29"
            height="31"
            alt=""
          />
          <span>Soter Labs</span>
        </Link>
        <div className="nav-label">PRIME REPORTS</div>
        <nav aria-label="Prime agents">
          {PRIMES.map((p) => (
            <Link
              key={p}
              href={reportHref(
                p,
                scope === "combined" ? "individual" : scope,
                view,
                year,
                month.key,
              )}
              className={!combined && prime === p ? "active" : ""}
              aria-current={!combined && prime === p ? "page" : undefined}
            >
              <span className={`dot ${p}`} />
              <span>{name(p)}</span>
              {!combined && prime === p && <ChevronRight size={14} />}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <Building2 size={23} />
          <div>
            <strong>Prime-agent reporting</strong>
            <small>Financial reporting</small>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <span>
            Prime reports <ChevronRight size={13} />
            <strong>{title}</strong>
          </span>
          <Controls />
        </header>
        <main>
          <div className="page-title">
            <div>
              <div className="eyebrow">
                PRIME AGENT <span>/</span> FINANCIAL REPORTING
              </div>
              <h1>{title}</h1>
              <p>
                {scope === "individual"
                  ? "Income, cash flow and reconciliation."
                  : scope === "group"
                    ? "Prime and controlled entities · Consolidation scope TBD."
                    : "Prime agents combined · Inter-prime eliminations TBD."}
              </p>
            </div>
            {(!cashView || (prime === "spark" && year === 2026)) ? <a className="button export" href={`/api/export?${query}`}>
              <ArrowDownToLine size={15} />
              {cashView ? "Cash flow CSV" : view === "income" ? "Statement CSV" : "Positions CSV"}
            </a> : <span className="button export export-placeholder" aria-hidden="true" />}
          </div>

          <div className="report-toolbar">
            <nav className="view-tabs" aria-label="Report view">
              <Link
                href={reportHref(prime, scope, "income", year, month.key)}
                className={view === "income" ? "selected" : ""}
                aria-current={view === "income" ? "page" : undefined}
              >
                Income statement
              </Link>
              <Link
                href={reportHref(prime, scope, "cash-flow", year, month.key)}
                className={view === "cash-flow" ? "selected" : ""}
                aria-current={view === "cash-flow" ? "page" : undefined}
              >
                Cash Flow Statement
              </Link>
              <Link
                href={reportHref(prime, scope, "reconciliation", year, month.key)}
                className={view === "reconciliation" ? "selected" : ""}
                aria-current={view === "reconciliation" ? "page" : undefined}
              >
                Reconciliation
              </Link>
            </nav>
            {view === "positions" && <ReportingMonthSelect months={months} value={month.key} />}
          </div>
          {scope !== "individual" && (
            <div className="notice">
              <CircleHelp size={16} />
              <span>
                {scope === "group"
                  ? "TBD · Controlled entities, ownership interests, and intragroup eliminations are not supplied by the reporting API."
                  : "TBD · Combined totals require aligned reporting periods and inter-prime eliminations. Source portfolios are shown separately."}
              </span>
            </div>
          )}
          {financial?.message && <p role="status">{financial.message}</p>}
          {!!financial?.report?.source_lag_periods.length && (
            <p role="status">
              A newer source correction is awaiting financial publication.
            </p>
          )}
          <FinancialLegend />
          {view === "reconciliation" ? <CashFlowStatement reconciliationOnly key={`reconciliation:${prime}:${year}`} prime={prime} year={year} months={months} report={cashFlow?.report} retained={cashFlow?.retained} message={cashFlow?.message} /> : view === "cash-flow" ? <CashFlowStatement key={`cash-flow:${prime}:${year}`} prime={prime} year={year} months={months} report={cashFlow?.report} retained={cashFlow?.retained} message={cashFlow?.message} /> : view === "income" ? (
            <>
              <IncomeStatement
                key={`${prime}:${year}`}
                rows={statementLines(
                  combined ? null : prime,
                  scope,
                  financial?.report,
                )}
                months={months}
                title={title}
                financial={financial?.report}
                retained={financial?.retained}
              />
              <OffchainAccruals
                report={financial?.report}
                retained={financial?.retained}
              />
              <ArchiveIncome
                report={financial?.report}
                retained={financial?.retained}
              />
              {scope !== "individual" && (
                <ScopePerimeter prime={prime} scope={scope} />
              )}
            </>
          ) : (
            <>
              {scope === "individual" && (
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>Tracked allocation value</h2>
                      <p>
                        <FinancialNumber
                          value={metricAmount(
                            positionFinancial?.report?.portfolio.closing_value,
                          )}
                          evidence={
                            positionFinancial?.report?.portfolio.closing_value
                          }
                          uncertainReason={
                            readUncertainty(positionFinancial) ||
                            (positionFinancial?.report?.source_lag
                              ? "A newer source is awaiting financial publication"
                              : null)
                          }
                        />{" "}
                        · USD
                      </p>
                      <p>
                        {positionFinancial?.report
                          ? `Through ${positionFinancial.report.cutoff} · ${positionFinancial.report.portfolio.perimeter_id || "Perimeter not yet approved"}`
                          : positionFinancial?.message ||
                            "No approved aggregate published"}
                      </p>
                      <p>
                        Reviewed positions only · TBD = missing data. Entity NAV
                        pending.
                      </p>
                      {(positionFinancial?.retained ||
                        positionFinancial?.report?.source_lag ||
                        positionFinancial?.report?.freshness.stale) && (
                        <p>Delayed or retained financial publication</p>
                      )}
                    </div>
                  </div>
                </section>
              )}
              <section className="panel">
                <div className="panel-heading">
                  <div>
                    <h2>Portfolio positions</h2>
                    <p>
                      {scope === "individual"
                        ? "Published investment positions"
                        : "Source positions before consolidation"}{" "}
                      · USD
                    </p>
                  </div>
                  <span className="count">{rows.length} source positions</span>
                </div>
                <div
                  className="table-wrap"
                  tabIndex={0}
                  role="region"
                  aria-label="Portfolio positions; scroll for all columns"
                >
                  <table className="positions-table">
                    <thead>
                      <tr>
                        <th>Investment</th>
                        {combined && <th>Prime agent</th>}
                        <th>As of · UTC</th>
                        <th>Opening value</th>
                        <th>Closing value</th>
                        <th>
                          Income earned<small>Accrual basis · MTD</small>
                        </th>
                        <th>Interest receivable</th>
                        <th>Income received in advance</th>
                        <th>
                          Cash income received<small>MTD</small>
                        </th>
                        <th>Interest expense</th>
                        <th>Net investment yield</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map(({ prime: p, venue: v, actualCutoff }) => (
                        <tr key={`${p}:${v.venue_id}`}>
                          <td>
                            <div className="allocation-name">
                              {cleanLabel(v.label)}
                            </div>
                            <small>
                              {v.venue_id} ·{" "}
                              {v.status === "available"
                                ? "Published position"
                                : v.reason || "Pending inputs"}
                            </small>
                          </td>
                          {combined && (
                            <td>
                              <span className={`dot ${p}`} />
                              {name(p)}
                            </td>
                          )}
                          <td>{date(actualCutoff)}</td>
                          <td>
                            <FinancialNumber
                              value={amount(v, "opening_position_value_usd")}
                              evidence={venueEvidence(v, "balance")}
                            />
                          </td>
                          <td>
                            <FinancialNumber
                              value={amount(v, "position_value_usd")}
                              evidence={venueEvidence(v, "balance")}
                            />
                          </td>
                          <td>
                            <FinancialNumber
                              value={positionAccruedIncome(
                                positionFinancial?.report,
                                v,
                              )}
                              evidence={
                                positionFinancial?.report?.portfolio.positions.find(
                                  (pos) => pos.source_venue_id === v.venue_id,
                                )?.income ||
                                positionFinancial?.report?.claims?.find(
                                  (claim) =>
                                    claim.source_venue_id === v.venue_id,
                                )?.income ||
                                venueEvidence(v, "income")
                              }
                              uncertainReason={
                                readUncertainty(positionFinancial) ||
                                readUncertainty(
                                  portfolios.find((row) => row.prime === p)
                                    ?.read,
                                ) ||
                                (positionFinancial?.report?.source_lag
                                  ? "A newer source is awaiting financial publication"
                                  : null)
                              }
                            />
                          </td>
                          <td>
                            <FinancialNumber
                              value={loanIncomeBalances(v).interestReceivable}
                              evidence={venueEvidence(v, "balance")}
                            />
                          </td>
                          <td>
                            <FinancialNumber
                              value={
                                loanIncomeBalances(v).incomeReceivedInAdvance
                              }
                              evidence={venueEvidence(v, "balance")}
                            />
                          </td>
                          <td>
                            <FinancialNumber
                              value={amount(v, "cash_received_usd")}
                              evidence={venueEvidence(v, "cash")}
                              uncertainReason={readUncertainty(
                                portfolios.find((row) => row.prime === p)?.read,
                              )}
                            />
                          </td>
                          <td>
                            <FinancialNumber />
                          </td>
                          <td>
                            <FinancialNumber />
                          </td>
                        </tr>
                      ))}
                      {!rows.length && (
                        <tr>
                          <td className="empty" colSpan={combined ? 11 : 10}>
                            <span className="tbd">TBD</span> · No published
                            positions for the selected month
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="panel-note">
                  Income and receivables may already be included in valuations;
                  do not add them again.
                </div>
              </section>
              {scope !== "individual" && (
                <ScopePerimeter prime={prime} scope={scope} />
              )}
            </>
          )}
          {view !== "cash-flow" && <><details hidden className="source-details">
            <summary>
              <FileText size={15} />
              Sources & accounting basis
              <ChevronRight size={15} />
            </summary>
            <div className="source-body">
              <p>
                Draft management figures. Available amounts are summed; TBD is
                not zero. Allocation-linked rewards belong to allocation income.
                Vault returns include embedded fees; other income may use
                receipts.
              </p>
              {prime === "grove" && (
                <p>
                  Offchain schedules show supplied accruals, cash and unpaid
                  income. * marks estimates, including GACLO’s proposed opening
                  carry. Separate fees await confirmation. Warehouse October
                  covers October 1–25 only; servicing confirmation is pending.
                </p>
              )}
              <p>
                Closed months use month-end sources. MTD uses the latest saved
                publication. Source revisions and accounting methods are
                retained below and in exports.
              </p>
              {financial?.report?.dashboard_composition && (
                <div className="source-row">
                  <strong>Spark expenses · Provisional workbook snapshot · 2026</strong>
                  <span>Source: prime_expenses.xlsx · Spark · Jan–Oct 2026</span>
                  <span>Expense revision: {financial.report.dashboard_composition.expense_revision}</span>
                  <span>Workbook SHA256: {financial.report.dashboard_composition.expense_source.sha256}</span>
                  <span>Dashboard display hash: {financial.report.dashboard_composition.display_hash}</span>
                  <span>API revenue input hash: {financial.report.dashboard_composition.api_report_hash || "Unavailable"}</span>
                </div>
              )}
              {(annual.length
                ? annual.map((r) => ({ prime, ...r }))
                : portfolios
              )
                .filter((p) => p.read.report)
                .map((p) => (
                  <div className="source-row" key={`${p.prime}:${p.month.key}`}>
                    <strong>
                      {name(p.prime)} · {p.month.key} · {p.actualCutoff}
                    </strong>
                    <span>Revision: {p.read.report!.data.revision_id}</span>
                    <span>View hash: {p.read.report!.data.view_hash}</span>
                    <span>
                      Published: {p.read.report!.data.computed_at} · API
                      checked: {p.read.verifiedAt}
                    </span>
                    <span>
                      Excluded inputs:{" "}
                      {p.read.report!.data.excluded_inputs.join(", ") ||
                        "None declared"}
                    </span>
                    {p.read.message && <span>{p.read.message}</span>}
                  </div>
                ))}
              <a href={API_DOC_URL} target="_blank" rel="noreferrer">
                Settlement and reporting dashboard API{" "}
                <ArrowUpRight size={13} />
              </a>
            </div>
          </details></>}
          <footer>
            <span>All monetary amounts are denominated in US dollars (USD).</span>
            <span>{view === "cash-flow" ? "Cash-flow reporting API" : financial?.report?.dashboard_composition ? "Reporting API + provisional expense snapshot" : "Reporting API only"}</span>
          </footer>
        </main>
      </div>
    </ReportingShell>
  );
}
function ScopePerimeter({ prime, scope }: { prime: Prime; scope: Scope }) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>
            {scope === "individual"
              ? "Reporting scope"
              : "Consolidation perimeter"}
          </h2>
          <p>
            {scope === "individual"
              ? "Entity attribution pending confirmation"
              : "Membership and elimination rules pending confirmation"}
          </p>
        </div>
        <span className="badge amount-missing">TBD</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{scope === "combined" ? "Prime agent" : "Entity"}</th>
              <th>Reporting perimeter</th>
              <th>Eliminations</th>
            </tr>
          </thead>
          <tbody>
            {(scope === "combined"
              ? PRIMES.map(name)
              : [
                  name(prime),
                  ...(scope === "group" ? ["Controlled entities"] : []),
                ]
            ).map((label) => (
              <tr key={label}>
                <td>{label}</td>
                <td>
                  <FinancialNumber />
                </td>
                <td>
                  <FinancialNumber />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

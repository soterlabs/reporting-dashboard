import {
  statementTotalLabel,
  financialPortfolioRows,
  positionAccruedIncome,
  metricAmount,
  statementMonthNote,
} from "@/lib/financial";
import { financialStatements, financialPortfolio } from "@/lib/api";
import Link from "next/link";
import {
  ArrowDownToLine,
  ArrowUpRight,
  Building2,
  ChevronRight,
  CircleHelp,
  FileText,
} from "lucide-react";
import { Controls } from "@/app/controls";
import { OffchainAccruals } from "./offchain-accruals";
import { IncomeStatement } from "./income-statement";
import { annualReports, portfolioReports } from "@/lib/report-data";
import {
  API_DOC_URL,
  individualScope,
  chooseMonth,
  scopeTitle,
  sourceCatalog,
  sourceIncome,
  sourceRows,
  statementLines,
  totalLabel,
  annualAmount,
  yearMonths,
  reportingYear,
  type MonthReport,
  type Scope,
  type View,
} from "@/lib/prime-reports";
import {
  amount,
  cleanLabel,
  loanIncomeBalances,
  money,
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
function Value({ value }: { value?: string | null }) {
  return (
    <span
      className={
        value == null ? "tbd" : value.startsWith("-") ? "negative" : ""
      }
    >
      {money(value)}
    </span>
  );
}
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
    param(search, "view") === "positions" ? "positions" : "income";
  const year = reportingYear(param(search, "year"));
  const months = yearMonths(year);
  const month = chooseMonth(months, param(search, "month"));
  const title = scopeTitle(prime, scope);
  // Financial components are independent of the unclassified source schedule.
  const annual =
    view === "income" && scope === "individual"
      ? await annualReports(prime, year)
      : [];
  const fromAnnual = annual.find((r) => r.month.key === month.key);
  const portfolios = fromAnnual
    ? [{ prime, ...fromAnnual }]
    : await portfolioReports(prime, scope, month);
  const financial =
    scope === "individual" && view === "income"
      ? await financialStatements(prime, year)
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
  const available = portfolios.filter((p) => p.read.report).length;
  const query = new URLSearchParams({
    prime,
    scope,
    view,
    year: String(year),
    month: month.key,
  });
  if (financial?.report)
    query.set("financial_revision", financial.report.selection);
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
  const anyStale = portfolios.some(
    (p) => p.read.retained || p.read.report?.freshness.stale,
  );
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/" className="brand">
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
            <small>Income & portfolio positions</small>
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
                  ? "Income statement and investment positions."
                  : scope === "group"
                    ? "Prime and controlled entities · Consolidation scope TBD."
                    : "Prime agents combined · Inter-prime eliminations TBD."}
              </p>
            </div>
            <a className="button export" href={`/api/export?${query}`}>
              <ArrowDownToLine size={15} />
              {view === "income" ? "Statement CSV" : "Positions CSV"}
            </a>
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
                href={reportHref(prime, scope, "positions", year, month.key)}
                className={view === "positions" ? "selected" : ""}
                aria-current={view === "positions" ? "page" : undefined}
              >
                Portfolio positions
              </Link>
            </nav>
            <form method="get" className="period-form">
              <input type="hidden" name="prime" value={prime} />
              <input type="hidden" name="scope" value={scope} />
              <input type="hidden" name="view" value={view} />
              <label>
                <span>Year</span>
                <select name="year" defaultValue={year}>
                  {Array.from(
                    { length: new Date().getUTCFullYear() - 2019 },
                    (_, i) => new Date().getUTCFullYear() - i,
                  ).map((y) => (
                    <option key={y} value={y}>
                      {y}
                    </option>
                  ))}
                </select>
              </label>
              {view === "positions" && (
                <label>
                  <span>Reporting month</span>
                  <select name="month" defaultValue={month.key}>
                    {months.map((m) => (
                      <option key={m.key} value={m.key}>
                        {m.label} {year}
                        {m.state === "partial" ? " · MTD" : ""}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button className="button primary">Apply</button>
            </form>
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
          <div className="report-status">
            <span className="badge">Draft · Unaudited</span>
            <span>
              {view === "income"
                ? `${year} · Monthly columns · ${statementTotalLabel(financial?.report, totalLabel(months))}`
                : `${month.label} ${year} · Closing positions`}
            </span>
            <span>
              {view === "positions"
                ? `${available}/${portfolios.length} venue source publications`
                : ""}
              {positionFinancial?.report
                ? ` · ${positionFinancial.report.portfolio.positions.filter((p) => p.closing_value.value !== null || p.income.value !== null).length} reviewed financial members`
                : ""}
              {view === "positions" && anyStale ? " · Delayed publication" : ""}
            </span>
          </div>
          {financial?.message && <p role="status">{financial.message}</p>}
          {!!financial?.report?.source_lag_periods.length && (
            <p role="status">
              A newer source correction is awaiting financial publication.
            </p>
          )}
          {view === "income" ? (
            <>
              <IncomeStatement
                key={`${prime}:${year}:${financial?.report?.policy_version || "unavailable"}`}
                rows={statementLines(
                  combined ? null : prime,
                  scope,
                  financial?.report,
                )}
                months={months}
                title={title}
                financial={financial?.report}
              />
              <OffchainAccruals report={financial?.report} />
              {scope === "individual" && (
                <SourceIncome
                  monthly={annual}
                  title={title}
                  query={query.toString()}
                />
              )}
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
                        {money(
                          metricAmount(
                            positionFinancial?.report?.portfolio.closing_value,
                          ),
                        )}{" "}
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
                            <Value
                              value={amount(v, "opening_position_value_usd")}
                            />
                          </td>
                          <td>
                            <Value value={amount(v, "position_value_usd")} />
                          </td>
                          <td>
                            <Value
                              value={positionAccruedIncome(
                                positionFinancial?.report,
                                v,
                              )}
                            />
                          </td>
                          <td>
                            <Value
                              value={loanIncomeBalances(v).interestReceivable}
                            />
                          </td>
                          <td>
                            <Value
                              value={
                                loanIncomeBalances(v).incomeReceivedInAdvance
                              }
                            />
                          </td>
                          <td>
                            <Value value={amount(v, "cash_received_usd")} />
                          </td>
                          <td>
                            <Value />
                          </td>
                          <td className="tbd">TBD</td>
                        </tr>
                      ))}
                      {!rows.length && (
                        <tr>
                          <td className="empty" colSpan={combined ? 11 : 10}>
                            TBD · No published positions for the selected month
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
          <details className="panel source-coverage">
            <summary className="panel-heading">
              <div>
                <h2>Publication coverage</h2>
                <p>
                  {month.label} {year} · Actual source dates
                </p>
              </div>
              <a
                className="text-link"
                href={API_DOC_URL}
                target="_blank"
                rel="noreferrer"
              >
                Reporting API guide <ArrowUpRight size={13} />
              </a>
            </summary>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Prime agent</th>
                    <th>Publication date</th>
                    <th>Coverage</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolios.map((p) => (
                    <tr key={p.prime}>
                      <td>{name(p.prime)}</td>
                      <td>{p.actualCutoff ? date(p.actualCutoff) : "TBD"}</td>
                      <td>
                        {p.read.message ||
                          (p.read.report
                            ? `${p.read.report.freshness.stale ? "Delayed · " : ""}${p.read.report.data.result.venues.filter((v) => v.enabled).length} enabled allocations${p.read.report.data.result.complete ? "" : " · Inputs incomplete"}`
                            : "TBD")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <details className="source-details">
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
          </details>
          <footer>
            <span>Draft · Unaudited · USD</span>
            <span>Reporting API only</span>
          </footer>
        </main>
      </div>
    </div>
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
        <span className="badge">TBD</span>
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
                <td className="tbd">TBD</td>
                <td className="tbd">TBD</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
function SourceIncome({
  monthly,
  title,
  query,
}: {
  monthly: MonthReport[];
  title: string;
  query: string;
}) {
  const catalog = sourceCatalog(monthly);
  const months = monthly.map((r) => r.month);
  return (
    <details className="panel income-schedule">
      <summary className="panel-heading">
        <div>
          <h2>Supporting allocation income</h2>
          <p>Source figures · Not additive to statement totals</p>
        </div>
        <ChevronRight size={16} />
      </summary>
      <div className="schedule-export">
        <a className="text-link" href={`/api/export?${query}&dataset=source`}>
          Source CSV <ArrowDownToLine size={13} />
        </a>
      </div>
      <div
        className="table-wrap financial-wrap"
        tabIndex={0}
        role="region"
        aria-label={`${title} supporting allocation income`}
      >
        <table className="financial-table source-schedule">
          <thead>
            <tr>
              <th>Allocation</th>
              {monthly.map((r) => (
                <th key={r.month.key}>
                  {r.month.label} {r.month.key.slice(0, 4)}
                  {r.month.state === "partial" && (
                    <small>
                      {statementMonthNote(r.month, {
                        actual_cutoff: r.actualCutoff,
                      })}
                    </small>
                  )}
                </th>
              ))}
              <th className="year-total">{totalLabel(months)}</th>
            </tr>
          </thead>
          <tbody>
            {catalog.flatMap((v) =>
              [false, true].map((accrual) => {
                const values = monthly.map((r) =>
                  sourceIncome(r.read, v.venue_id, accrual),
                );
                return (
                  <tr key={`${v.venue_id}:${accrual}`}>
                    <th scope="row">
                      <div className="allocation-name">
                        {cleanLabel(v.label)}
                      </div>
                      <small>
                        {accrual
                          ? "Accrual-basis income"
                          : "Reported income · Basis may differ"}
                      </small>
                    </th>
                    {values.map((value, i) => (
                      <td key={months[i].key}>
                        <Value value={value} />
                      </td>
                    ))}
                    <td className="year-total">
                      <Value value={annualAmount(values, months)} />
                    </td>
                  </tr>
                );
              }),
            )}
            {!catalog.length && (
              <tr>
                <td colSpan={14} className="empty">
                  TBD · No compatible allocation publications in this year
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="panel-note">
        Reported and accrued rows are alternate views of the same income.
      </div>
    </details>
  );
}

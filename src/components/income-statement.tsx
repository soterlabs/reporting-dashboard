"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  financialLine,
  statementMonths,
  statementTotalLabel,
  metricExplanation,
  rwaPolicies,
  allocationRewardsPolicy,
  metricAmount,
  statementMonthNote,
  type Metric,
  type FinancialStatement,
} from "@/lib/financial";
import { money } from "@/lib/reporting";
import {
  totalLabel,
  collapsedStatementGroups,
  type Month,
  type StatementLine,
} from "@/lib/prime-reports";

export function IncomeStatement({
  rows,
  months: calendarMonths,
  title,
  financial,
}: {
  rows: StatementLine[];
  months: Month[];
  title: string;
  financial?: FinancialStatement | null;
}) {
  const months = statementMonths(financial, calendarMonths);
  const [collapsed, setCollapsed] = useState<Set<string>>(() =>
    collapsedStatementGroups(rows),
  );
  const hasChildren = (id: string) => rows.some((r) => r.parent === id);
  function visible(row: StatementLine): boolean {
    if (!row.parent) return true;
    if (collapsed.has(row.parent)) return false;
    const parent = rows.find((r) => r.id === row.parent);
    return !parent || visible(parent);
  }
  function toggle(id: string) {
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{title} income statement</h2>
          <p>USD · Accrual basis intended · Unaudited</p>
          <p className="statement-help">
            Completed months are reported through month end. MTD = month to
            date.
          </p>
          <p className="statement-help">
            TBD means data is missing or unconfirmed. Totals sum available
            amounts and may change as data is added.
          </p>
        </div>
        <button
          className="button"
          onClick={() =>
            setCollapsed(
              collapsed.size
                ? new Set()
                : new Set(
                    rows.filter((r) => hasChildren(r.id)).map((r) => r.id),
                  ),
            )
          }
        >
          {collapsed.size ? "Expand all" : "Collapse all"}
        </button>
      </div>
      <div
        className="table-wrap financial-wrap"
        tabIndex={0}
        role="region"
        aria-label={`${title} annual income statement; scroll horizontally for all months`}
      >
        <table className="financial-table">
          <thead>
            <tr>
              <th scope="col">Line item</th>
              {months.map((m) => (
                <th scope="col" key={m.key}>
                  {m.label} {m.key.slice(0, 4)}
                  {statementMonthNote(
                    m,
                    financial?.periods.find((p) => p.key === m.key),
                  ) && (
                    <small>
                      {statementMonthNote(
                        m,
                        financial?.periods.find((p) => p.key === m.key),
                      )}
                    </small>
                  )}
                </th>
              ))}
              <th scope="col" className="year-total">
                {statementTotalLabel(financial, totalLabel(months))}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.filter(visible).map((row) => (
              <tr key={row.id} className={row.kind || ""}>
                <th scope="row" style={{ paddingLeft: 18 + row.level * 17 }}>
                  {hasChildren(row.id) ? (
                    <button
                      className="row-toggle"
                      aria-expanded={!collapsed.has(row.id)}
                      onClick={() => toggle(row.id)}
                    >
                      {collapsed.has(row.id) ? (
                        <ChevronRight size={13} />
                      ) : (
                        <ChevronDown size={13} />
                      )}
                      {row.label}
                    </button>
                  ) : (
                    row.label
                  )}
                </th>
                {months.map((m) => {
                  const item = financialLine(financial, row.id)?.values[m.key];
                  return (
                    <td key={m.key} title={metricExplanation(item, financial)}>
                      {row.kind !== "section" && !row.structural && (
                        <MetricValue
                          item={item}
                          future={m.state === "future"}
                        />
                      )}
                    </td>
                  );
                })}
                <td
                  className="year-total"
                  title={metricExplanation(
                    financialLine(financial, row.id)?.total,
                    financial,
                  )}
                >
                  {row.kind !== "section" && !row.structural && (
                    <MetricValue
                      item={financialLine(financial, row.id)?.total}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-note">
        Reported amounts include AR, Sky funding, reviewed allocation income and
        classified rewards. Vault income is after embedded fees; lending
        distributions and USDG use receipt recognition.
        {financial?.policy_version === allocationRewardsPolicy && (
          <>
            {" "}
            Allocation-linked incentives and rewards are included in allocation
            income. Other incentives and rewards received covers income
            unrelated to an allocation.
          </>
        )}
        {rwaPolicies.includes(financial?.policy_version || "") &&
          financial?.prime === "grove" && (
            <>
              {" "}
              RWA fund income includes NAV changes and distributions after
              capital flows and Sky's share; it is not contractual interest or
              cash received.{" "}
            </>
          )}
        Hover over amounts for coverage and source details. Missing amounts are
        not confirmed zeroes; pending months are not forecasts.
      </div>
    </section>
  );
}

function MetricValue({
  item,
  future = false,
}: {
  item?: Metric;
  future?: boolean;
}) {
  if (future || item?.status === "future")
    return <span className="tbd">—</span>;
  const value = metricAmount(item);
  return <span className={value === null ? "tbd" : ""}>{money(value)}</span>;
}

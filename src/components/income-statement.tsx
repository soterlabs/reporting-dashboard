"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  financialLine,
  statementMonths,
  statementTotalLabel,
  type FinancialStatement,
} from "@/lib/financial";
import { money } from "@/lib/reporting";
import {
  totalLabel,
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
  const [collapsed, setCollapsed] = useState<Set<string>>(
    () => new Set(["gains", "operating", "other-expenses", "incentives"]),
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
                  <small>
                    {financial?.periods.find((p) => p.key === m.key)
                      ?.actual_cutoff && (
                      <span>
                        Through{" "}
                        {
                          financial.periods.find((p) => p.key === m.key)!
                            .actual_cutoff
                        }
                        <br />
                      </span>
                    )}
                    {m.state === "partial"
                      ? "MTD"
                      : m.state === "future"
                        ? "Future"
                        : "Month end"}
                  </small>
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
                {months.map((m) => (
                  <td
                    key={m.key}
                    className={
                      financialLine(financial, row.id)?.values[m.key]?.value !=
                      null
                        ? ""
                        : "tbd"
                    }
                    title={
                      financialLine(financial, row.id)?.values[m.key]?.reason ||
                      financialLine(financial, row.id)?.values[m.key]?.basis ||
                      "Classification or inputs not yet available"
                    }
                  >
                    {row.kind === "section"
                      ? ""
                      : money(
                          financialLine(financial, row.id)?.values[m.key]
                            ?.value ?? null,
                        )}
                  </td>
                ))}
                <td
                  className={`${financialLine(financial, row.id)?.total.value != null ? "" : "tbd "}year-total`}
                >
                  {row.kind === "section"
                    ? ""
                    : money(
                        financialLine(financial, row.id)?.total.value ?? null,
                      )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-note">
        First slice: AR, Sky funding components and Obex Maple net investment
        income. Maple income is after embedded vault fees. These components do
        not certify their parent totals. TBD = unavailable or unconfirmed.
        Subtotals require complete classifications and expense data. Future
        months are not forecasts.
      </div>
    </section>
  );
}

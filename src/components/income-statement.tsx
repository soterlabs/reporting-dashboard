"use client";
import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  statementMonths,
  statementTotalLabel,
  metricExplanation,
  metricAmount,
  statementMonthNote,
  type FinancialStatement,
} from "@/lib/financial";
import { FinancialNumber } from "./financial-number";
import {
  statementFinancialLine,
  statementRowUncertainty,
} from "@/lib/statement-values";
import { visibleStatementLines } from "@/lib/statement-layout";
import type { CSSProperties } from "react";
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
  retained = false,
}: {
  rows: StatementLine[];
  months: Month[];
  title: string;
  financial?: FinancialStatement | null;
  retained?: boolean;
}) {
  const months = statementMonths(financial, calendarMonths);
  const labels = Object.fromEntries(rows.map((row) => [row.id, row.label]));
  const values = new Map(
    rows.map((row) => [row.id, statementFinancialLine(financial, row)]),
  );
  // Expanded IDs keep newly arriving API groups collapsed by default.
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const groups = collapsedStatementGroups(rows);
  const collapsed = new Set([...groups].filter((id) => !expanded.has(id)));
  const hasChildren = (id: string) => groups.has(id);
  function toggle(id: string) {
    setExpanded((current) => {
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
        </div>
        <button
          className="button"
          onClick={() =>
            setExpanded(collapsed.size ? new Set(groups) : new Set())
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
            {visibleStatementLines(rows, collapsed).map((row) => (
              <tr
                key={row.id}
                data-row-id={row.id}
                data-depth={row.level}
                className={row.kind || (hasChildren(row.id) ? "group" : "")}
              >
                <th
                  scope="row"
                  style={{ "--statement-depth": row.level } as CSSProperties}
                >
                  {hasChildren(row.id) ? (
                    <button
                      className="row-toggle statement-label"
                      aria-expanded={!collapsed.has(row.id)}
                      onClick={() => toggle(row.id)}
                    >
                      {collapsed.has(row.id) ? (
                        <ChevronRight size={13} />
                      ) : (
                        <ChevronDown size={13} />
                      )}
                      <span>{row.label}</span>
                    </button>
                  ) : (
                    <span className="statement-label">
                      <span className="row-toggle-spacer" aria-hidden="true" />
                      <span>{row.label}</span>
                    </span>
                  )}
                </th>
                {months.map((m) => {
                  const line = values.get(row.id);
                  const item = line?.values[m.key];
                  return (
                    <td
                      key={m.key}
                      title={metricExplanation(item, financial, labels)}
                    >
                      {row.kind !== "section" && !row.structural && (
                        <FinancialNumber
                          value={metricAmount(item)}
                          evidence={item}
                          future={m.state === "future"}
                          uncertainReason={statementRowUncertainty(
                            financial,
                            row,
                            m.key,
                            retained,
                          )}
                          detail={metricExplanation(item, financial, labels)}
                        />
                      )}
                    </td>
                  );
                })}
                <td
                  className="year-total"
                  title={metricExplanation(
                    values.get(row.id)?.total,
                    financial,
                    labels,
                  )}
                >
                  {row.kind !== "section" && !row.structural && (
                    <FinancialNumber
                      value={metricAmount(values.get(row.id)?.total)}
                      evidence={values.get(row.id)?.total}
                      uncertainReason={statementRowUncertainty(
                        financial,
                        row,
                        undefined,
                        retained,
                      )}
                      detail={metricExplanation(
                        values.get(row.id)?.total,
                        financial,
                        labels,
                      )}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-note">
        {financial?.dashboard_composition && "Expenses: provisional workbook figures through Oct 2026. "}
        Hover over amounts for sources and coverage.
      </div>
    </section>
  );
}

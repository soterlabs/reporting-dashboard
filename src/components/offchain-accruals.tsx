import { ChevronRight } from "lucide-react";
import {
  metricAmount,
  metricExplanation,
  type FinancialStatement,
} from "@/lib/financial";
import { money } from "@/lib/reporting";

export function OffchainAccruals({
  report,
}: {
  report?: FinancialStatement | null;
}) {
  const positions = report?.offchain_positions?.filter(
    (p) => Object.keys(p.values).length,
  );
  if (!positions?.length) return null;
  const columns = [
    ["closing_principal", "Principal"],
    ["earned_income", "Earned"],
    ["cash_received", "Received"],
    ["closing_receivable", "Unpaid"],
    ["fees", "Fees"],
  ];
  return (
    <details className="panel income-schedule">
      <summary className="panel-heading">
        <h2>Offchain accruals</h2>
        <ChevronRight size={16} />
      </summary>
      <div className="schedule-export">
        <a
          className="text-link"
          href={`/api/export?${new URLSearchParams({ prime: report!.prime, year: String(report!.year), dataset: "offchain", financial_revision: report!.selection })}`}
        >
          CSV
        </a>
      </div>
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Monthly offchain accruals"
      >
        <table>
          <thead>
            <tr>
              <th>Allocation</th>
              <th>Through</th>
              {columns.map(([key, label]) => (
                <th key={key}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {positions.flatMap((position) =>
              Object.entries(position.values).map(([month, row]) => (
                <tr key={`${position.source_venue_id}:${month}`}>
                  <td>{position.label}</td>
                  <td>{row.period_end}</td>
                  {columns.map(([key]) => {
                    const item = row.metrics[key];
                    const value = metricAmount(item);
                    return (
                      <td key={key} title={metricExplanation(item, report)}>
                        <span className={value === null ? "tbd" : ""}>
                          {money(value)}
                        </span>
                        {value !== null && item.quality === "estimate" && (
                          <sup title="Estimate">*</sup>
                        )}
                      </td>
                    );
                  })}
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
      <div className="panel-note">
        USD · * Estimate. Earned income is included above; received cash is not
        added again. Fees pending confirmation.
      </div>
    </details>
  );
}

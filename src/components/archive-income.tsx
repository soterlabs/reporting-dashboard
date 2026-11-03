import { ChevronRight } from "lucide-react";
import {
  metricAmount,
  metricExplanation,
  type FinancialStatement,
} from "@/lib/financial";
import { money } from "@/lib/reporting";

const bases: Record<string, string> = {
  receipt: "Receipts",
  receipt_in_kind: "In-kind receipts",
  investment_return: "Vault return",
  realized_gain: "Disposal gain",
  estimated_accrual: "Accrual scenario",
  recorded_change: "Recorded change",
};
export function ArchiveIncome({
  report,
}: {
  report?: FinancialStatement | null;
}) {
  if (!report?.archive_income?.length) return null;
  const query = new URLSearchParams({
    prime: report.prime,
    year: String(report.year),
    dataset: "archive",
    financial_revision: report.selection,
  });
  return (
    <details className="panel income-schedule">
      <summary className="panel-heading">
        <h2>Archive income</h2>
        <ChevronRight size={16} />
      </summary>
      <div className="schedule-export">
        <a className="text-link" href={`/api/export?${query}`}>
          CSV
        </a>
      </div>
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Imported Grove income"
      >
        <table>
          <thead>
            <tr>
              <th>Allocation</th>
              <th>Month</th>
              <th>Basis</th>
              <th>Amount · USD</th>
              <th>Use</th>
            </tr>
          </thead>
          <tbody>
            {report.archive_income.map((r) => (
              <tr key={`${r.month}:${r.id}`}>
                <td>{r.label}</td>
                <td>{r.month}</td>
                <td>{bases[r.metric.recognition] || r.metric.recognition}</td>
                <td title={metricExplanation(r.metric, report)}>
                  {money(metricAmount(r.metric))}
                  {r.metric.quality === "estimate" && (
                    <sup title="Estimate or nominal USD valuation">*</sup>
                  )}
                </td>
                <td>{r.included_in_totals ? "Statement" : "Reference only"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="panel-note">
        * Estimated timing or nominal USD valuation. Reference rows are excluded
        from totals; in-kind receipts are not bank cash.
      </div>
    </details>
  );
}

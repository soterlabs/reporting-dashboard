import { money } from "@/lib/reporting";
import {
  numberConfidence,
  type ConfidenceContext,
  type Evidence,
} from "@/lib/number-confidence";

export function FinancialNumber({
  value,
  evidence,
  future,
  uncertainReason,
  detail,
}: {
  value?: string | null;
  evidence?: Evidence | null;
  detail?: string;
} & ConfidenceContext) {
  const { tone, reason } = numberConfidence(value, evidence, {
    future,
    uncertainReason,
  });
  const text = tone === "future" ? "—" : money(value);
  return (
    <span
      className={`financial-number amount-${tone}`}
      data-tone={tone}
      title={[reason, detail].filter(Boolean).join(" · ")}
    >
      {text}
      <span className="number-basis"> — {reason}</span>
      {value != null &&
        tone !== "future" &&
        evidence?.quality === "estimate" && <sup aria-hidden="true">*</sup>}
    </span>
  );
}

export function FinancialLegend() {
  return (
    <div className="number-legend" aria-label="Financial number colors">
      <span className="amount-accrual">Green: accrual / earned return</span>
      <span className="amount-cash">Blue: receipts / realized</span>
      <span className="amount-uncertain">Orange: uncertain / mixed</span>
      <span className="amount-missing">Red: TBD</span>
    </div>
  );
}

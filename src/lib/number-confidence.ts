import {
  metricAmount,
  type FinancialStatement,
  type Metric,
} from "./financial.ts";
import type { Venue } from "./reporting.ts";

export type NumberTone =
  | "accrual"
  | "cash"
  | "uncertain"
  | "missing"
  | "future";
export type Evidence = Partial<
  Pick<Metric, "status" | "recognition" | "quality" | "basis">
>;
export interface ConfidenceContext {
  future?: boolean;
  uncertainReason?: string | null;
}

// Recognition is an explicit whitelist. "existing", a venue label, a positive
// balance or an available publication never establish an income basis.
export function numberConfidence(
  value: string | null | undefined,
  evidence?: Evidence | null,
  context: ConfidenceContext = {},
): { tone: NumberTone; reason: string } {
  if (context.future || evidence?.status === "future")
    return { tone: "future", reason: "Future period; no forecast" };
  if (value == null)
    return { tone: "missing", reason: "TBD: no supported amount" };
  if (context.uncertainReason)
    return { tone: "uncertain", reason: context.uncertainReason };
  if (evidence?.quality === "estimate")
    return {
      tone: "uncertain",
      reason: "Estimated timing, valuation or amount",
    };
  if (evidence?.status === "partial")
    return {
      tone: "uncertain",
      reason: "Partial amount: some components or periods are missing",
    };
  const basis = evidence?.basis?.trim().toLowerCase();
  if (
    evidence?.status !== "available" ||
    !basis ||
    ["unknown", "unclassified", "existing"].includes(basis) ||
    (evidence.quality !== undefined && evidence.quality !== "supported")
  )
    return {
      tone: "uncertain",
      reason: "Confidence or income basis is not established",
    };
  if (["accrual", "investment_return"].includes(evidence.recognition || ""))
    return {
      tone: "accrual",
      reason: "Supported accrued income or earned investment return",
    };
  if (
    ["receipt", "receipt_in_kind", "realized_gain"].includes(
      evidence.recognition || "",
    )
  )
    return {
      tone: "cash",
      reason: "Supported receipts or realized income; not accrued income",
    };
  if (
    ["valuation", "balance", "capital_flow"].includes(
      evidence.recognition || "",
    )
  )
    return {
      tone: "uncertain",
      reason:
        "Balance or capital measure: no accrual/cash income basis assigned",
    };
  return { tone: "uncertain", reason: "Mixed or unconfirmed income basis" };
}

export function warehouseUncertainty(
  lineId: string,
  item?: Metric,
): string | null {
  // "supported" in this source means supplied schedule, not servicing-confirmed.
  // Keep this explicit review override until verified servicing data replaces it.
  return lineId === "investment.offchain.warehouse" &&
    item?.basis === "counterparty_monthly_schedule" &&
    item.recognition === "accrual"
    ? "Warehouse earned income awaits servicing confirmation"
    : null;
}

export function statementUncertainty(
  report: FinancialStatement | null | undefined,
  lineId: string,
  month?: string,
  retained = false,
  seen = new Set<string>(),
): string | null {
  if (retained) return "Retained publication: the latest refresh failed";
  if (!report) return null;
  if (seen.has(lineId)) return "Unresolved cyclic component metadata";
  const line = report.lines.find((row) => row.id === lineId);
  if (!line)
    return seen.size ? "Component confidence is not established" : null;
  const item = month ? line.values[month] : line.total;
  if (!item || metricAmount(item) === null) return null;
  const periods = report.periods.filter(
    (p) => p.state !== "future" && (!month || p.key === month),
  );
  if (
    periods.some(
      (p) =>
        p.stale || report.source_lag_periods.includes(p.actual_cutoff || ""),
    )
  )
    return "Delayed source or a correction awaiting financial publication";
  if (month) {
    const pending = warehouseUncertainty(lineId, item);
    if (pending) return pending;
  } else if (
    periods.some(
      (p) =>
        warehouseUncertainty(lineId, line.values[p.key]) &&
        metricAmount(line.values[p.key]) !== null,
    )
  ) {
    return "Contains Warehouse earned income awaiting servicing confirmation";
  }
  const next = new Set(seen).add(lineId);
  const components =
    month && item.component_ids
      ? item.component_ids
      : (line.components || []).map((term) => term.id);
  if (
    !Array.isArray(components) ||
    components.some((id) => typeof id !== "string") ||
    (!!line.components?.length && components.length === 0)
  )
    return "Component confidence is not established";
  for (const component of components) {
    const reason = statementUncertainty(report, component, month, false, next);
    if (reason) return reason;
  }
  return null;
}

export function venueEvidence(
  venue: Venue,
  measure: "income" | "cash" | "balance",
): Evidence {
  const status =
    venue.enabled && venue.status === "available" ? "available" : "partial";
  const recognition =
    measure === "balance"
      ? "valuation"
      : measure === "cash"
        ? "receipt"
        : venue.method === "loan_accrual"
          ? "accrual"
          : venue.method === "alm_receipts"
            ? "receipt"
            : "unknown";
  return {
    status,
    recognition,
    basis:
      measure === "cash"
        ? "classified_source_cash_received"
        : measure === "balance"
          ? "source_position_valuation"
          : venue.method,
  };
}

export function readUncertainty(
  read?: {
    retained: boolean;
    report: { freshness: { stale: boolean } } | null;
  } | null,
): string | null {
  return read?.retained
    ? "Retained publication: the latest refresh failed"
    : read?.report?.freshness.stale
      ? "Source publication is delayed for the requested cutoff"
      : null;
}

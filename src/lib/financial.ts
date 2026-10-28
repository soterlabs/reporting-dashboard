import type { Prime } from "./reporting.ts";
import { yearMonths, type Month } from "./prime-reports.ts";

export interface Metric {
  value: string | null;
  known_value: string | null;
  status: "available" | "unavailable" | "partial" | "future";
  unit: "USD";
  recognition: string;
  basis: string;
  reason: string | null;
  source_paths: string[];
}
export interface FinancialStatement {
  schema_version: "3.0";
  policy_version: string;
  prime: Prime;
  scope: "individual";
  year: number;
  as_of: string;
  selection: string;
  report_hash: string;
  total_label: "FY" | "YTD";
  periods: {
    key: string;
    state: Month["state"];
    actual_cutoff: string | null;
    expected_cutoff: string | null;
    stale: boolean;
    financial_revision: string | null;
  }[];
  lines: {
    id: string;
    label: string;
    values: Record<string, Metric>;
    total: Metric;
  }[];
  source_manifest: Record<
    string,
    { cutoff: string; revision_id: string; result_hash: string }
  >;
  source_lag_periods: string[];
}
export interface FinancialPortfolio {
  schema_version: "3.0";
  prime: Prime;
  scope: "individual";
  cutoff: string;
  financial_revision: string;
  report_hash: string;
  policy_version: string;
  source: { revision_id: string; result_hash: string };
  source_lag: boolean;
  freshness: { stale: boolean };
  portfolio: {
    measure: "tracked_allocations";
    perimeter_id: string | null;
    expected_position_ids: string[];
    excluded_source_venue_ids: string[];
    opening_value: Metric;
    closing_value: Metric;
    positions: {
      position_id: string;
      source_venue_id: string;
      income: Metric;
      opening_value: Metric;
      closing_value: Metric;
    }[];
  };
}
export interface FinancialRead<T> {
  report: T | null;
  retained: boolean;
  message: string | null;
}
const policy = "prime-management.first-slice.v1";
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const decimal = (v: unknown) =>
  typeof v === "string" && /^-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/.test(v);
const date = (v: unknown) =>
  typeof v === "string" &&
  /^\d{4}-\d\d-\d\d$/.test(v) &&
  Number.isFinite(Date.parse(v)) &&
  new Date(v).toISOString().slice(0, 10) === v;
function requireValue(ok: unknown): asserts ok {
  if (!ok) throw new Error("Financial reporting contract mismatch");
}
function metric(v: Metric) {
  requireValue(
    v &&
      ["available", "unavailable", "partial", "future"].includes(v.status) &&
      v.unit === "USD",
  );
  requireValue(v.value === null || decimal(v.value));
  requireValue(v.known_value === null || decimal(v.known_value));
  requireValue((v.status === "available") === (v.value !== null));
  requireValue(
    typeof v.basis === "string" &&
      typeof v.recognition === "string" &&
      (v.reason === null || typeof v.reason === "string") &&
      Array.isArray(v.source_paths) &&
      v.source_paths.every((p) => typeof p === "string") &&
      (v.status === "partial" || v.known_value === null),
  );
}
export function validateStatement(
  value: unknown,
  prime: Prime,
  year: number,
  selection?: string,
): FinancialStatement {
  const v = value as FinancialStatement;
  requireValue(
    v &&
      v.schema_version === "3.0" &&
      v.policy_version === policy &&
      v.prime === prime &&
      v.year === year &&
      v.scope === "individual",
  );
  requireValue(
    date(v.as_of) &&
      v.as_of.startsWith(`${year}-`) &&
      hash(v.report_hash) &&
      typeof v.selection === "string" &&
      v.selection.length > 0 &&
      v.selection.length <= 4096 &&
      (!selection || v.selection === selection) &&
      Array.isArray(v.periods) &&
      v.periods.length === 12 &&
      ["FY", "YTD"].includes(v.total_label),
  );
  const expected = yearMonths(year, new Date(Date.parse(v.as_of) + 86400000));
  requireValue(
    v.total_label ===
      (expected.every((p) => p.state === "complete") ? "FY" : "YTD"),
  );
  v.periods.forEach((p, i) => {
    const bounds = expected[i];
    requireValue(
      p &&
        p.key === bounds.key &&
        p.state === bounds.state &&
        p.expected_cutoff === bounds.cutoff,
    );
    requireValue(
      typeof p.stale === "boolean" &&
        (p.financial_revision === null || hash(p.financial_revision)),
    );
    requireValue(
      (p.actual_cutoff === null) === (p.financial_revision === null),
    );
    requireValue(
      p.actual_cutoff === null ||
        (date(p.actual_cutoff) &&
          bounds.cutoff &&
          p.actual_cutoff.startsWith(bounds.key) &&
          p.actual_cutoff <= bounds.cutoff &&
          (bounds.state !== "complete" || p.actual_cutoff === bounds.cutoff)),
    );
    requireValue(
      p.stale ===
        Boolean(
          p.actual_cutoff && bounds.cutoff && p.actual_cutoff < bounds.cutoff,
        ),
    );
  });
  requireValue(
    Array.isArray(v.lines) &&
      new Set(v.lines.map((l) => l.id)).size === v.lines.length,
  );
  for (const l of v.lines) {
    requireValue(typeof l.id === "string");
    metric(l.total);
    for (const p of v.periods) {
      const cell = l.values[p.key];
      metric(cell);
      requireValue((cell.status === "future") === (p.state === "future"));
      requireValue(p.financial_revision !== null || cell.value === null);
    }
    requireValue(
      l.total.value === null ||
        v.periods
          .filter((p) => p.state !== "future")
          .every((p) => l.values[p.key].status === "available"),
    );
  }
  requireValue(v.source_manifest && Array.isArray(v.source_lag_periods));
  for (const p of v.periods)
    if (p.financial_revision) {
      const s = v.source_manifest[p.financial_revision];
      requireValue(
        s &&
          s.cutoff === p.actual_cutoff &&
          hash(s.revision_id) &&
          hash(s.result_hash),
      );
    }
  return v;
}
export function validatePortfolio(
  value: unknown,
  prime: Prime,
  month: string,
  source?: string,
  cutoff?: string,
  revision?: string,
): FinancialPortfolio {
  const v = value as FinancialPortfolio;
  requireValue(
    v &&
      v.schema_version === "3.0" &&
      v.policy_version === policy &&
      v.prime === prime &&
      v.scope === "individual" &&
      date(v.cutoff) &&
      v.cutoff.slice(0, 7) === month &&
      (!cutoff || v.cutoff === cutoff),
  );
  requireValue(
    hash(v.financial_revision) &&
      (!revision || v.financial_revision === revision) &&
      hash(v.report_hash) &&
      hash(v.source?.revision_id) &&
      hash(v.source?.result_hash) &&
      (!source || v.source.revision_id === source),
  );
  requireValue(
    typeof v.source_lag === "boolean" &&
      typeof v.freshness?.stale === "boolean",
  );
  const p = v.portfolio;
  requireValue(
    p &&
      p.measure === "tracked_allocations" &&
      Array.isArray(p.positions) &&
      Array.isArray(p.expected_position_ids) &&
      Array.isArray(p.excluded_source_venue_ids),
  );
  metric(p.opening_value);
  metric(p.closing_value);
  requireValue(
    new Set(p.positions.map((v) => v.source_venue_id)).size ===
      p.positions.length,
  );
  requireValue(
    new Set(p.positions.map((v) => v.position_id)).size === p.positions.length,
  );
  for (const position of p.positions) {
    requireValue(
      typeof position.source_venue_id === "string" &&
        typeof position.position_id === "string",
    );
    metric(position.income);
    metric(position.opening_value);
    metric(position.closing_value);
  }
  return v;
}
const bindings: Record<string, string> = {
  ar: "demand.agent_rate",
  "sky-funding": "funding.sky.net",
  "sky-funding-gross": "funding.sky.gross",
  "sky-funding-reimbursement": "funding.sky.reimbursement",
  "obex-maple": "investment.maple_syrup_usdc",
};
export function financialLine(
  report: FinancialStatement | null | undefined,
  id: string,
) {
  return report?.lines.find((l) => l.id === bindings[id]);
}

// Retained reports keep the API's period classification when the calendar advances.
export function statementMonths(
  report: FinancialStatement | null | undefined,
  fallback: Month[],
): Month[] {
  return report
    ? fallback.map((m, i) => ({
        ...m,
        state: report.periods[i].state,
        cutoff: report.periods[i].expected_cutoff,
      }))
    : fallback;
}
export function statementTotalLabel(
  report: FinancialStatement | null | undefined,
  fallback: string,
) {
  return report ? `${report.total_label} ${report.year}` : fallback;
}

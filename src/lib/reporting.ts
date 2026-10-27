import Decimal from "decimal.js";

Decimal.set({ precision: 60 });
export const PRIMES = [
  "spark",
  "grove",
  "obex",
  "keel",
  "osero",
  "skybase",
] as const;
export type Prime = (typeof PRIMES)[number];
export const name = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
export const MONEY_FIELDS = [
  "opening_position_value_usd",
  "position_value_usd",
  "income_usd",
  "cash_received_usd",
  "principal_usd",
  "opening_unpaid_income_usd",
  "unpaid_income_usd",
] as const;
type MoneyField = (typeof MONEY_FIELDS)[number];
export type Venue = Record<MoneyField, string | null> & {
  venue_id: string;
  label: string;
  chain: string;
  method: string;
  status: "available" | "unavailable" | "disabled" | "not_started";
  enabled: boolean;
  reason: string | null;
};
export interface Publication {
  cutoff: string;
  revision_id: string;
  computed_at: string;
  provisional: boolean;
  excluded_inputs: string[];
  source_result_hash: string;
  view_hash: string;
  code_version: string;
  configuration_version: string;
  input_revision: string;
  result: {
    venues: Venue[];
    complete: boolean;
    period: { start: string; end: string };
    totals: null;
  };
}
export interface Report {
  schema_version: "2.0";
  prime: Prime;
  view: "reporting";
  estimate_basis: "month_to_date";
  data: Publication;
  freshness: { stale: boolean; actual_cutoff: string; expected_cutoff: string };
  latest_attempt: { status: string; cutoff: string } | null;
}
export type ReadResult = {
  report: Report | null;
  message: string | null;
  retained: boolean;
  verifiedAt: string | null;
};
const isoDate = /^\d{4}-\d{2}-\d{2}$/;
const decimal = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const hash = /^[a-f0-9]{64}$/;
export function validatePublication(value: unknown): Publication {
  const p = value as Publication;
  if (
    !p ||
    !isoDate.test(p.cutoff) ||
    !hash.test(p.revision_id) ||
    typeof p.computed_at !== "string" ||
    !Number.isFinite(Date.parse(p.computed_at)) ||
    typeof p.provisional !== "boolean" ||
    !Array.isArray(p.excluded_inputs) ||
    !p.excluded_inputs.every((x) => typeof x === "string") ||
    !hash.test(p.view_hash) ||
    !hash.test(p.source_result_hash) ||
    !p.result ||
    p.result.totals !== null ||
    typeof p.result.complete !== "boolean" ||
    !Array.isArray(p.result.venues) ||
    !isoDate.test(p.result.period?.start) ||
    p.result.period.end !== p.cutoff ||
    p.result.period.start !== `${p.cutoff.slice(0, 7)}-01`
  )
    throw new Error("Invalid reporting publication");
  const ids = new Set<string>();
  for (const row of p.result.venues) {
    if (
      !row ||
      typeof row.venue_id !== "string" ||
      ids.has(row.venue_id) ||
      typeof row.label !== "string" ||
      typeof row.chain !== "string" ||
      typeof row.method !== "string" ||
      typeof row.enabled !== "boolean" ||
      !["available", "unavailable", "disabled", "not_started"].includes(
        row.status,
      ) ||
      !(row.reason === null || typeof row.reason === "string")
    )
      throw new Error("Invalid allocation");
    ids.add(row.venue_id);
    for (const key of MONEY_FIELDS)
      if (
        row[key] !== null &&
        (typeof row[key] !== "string" ||
          !decimal.test(row[key]) ||
          !new Decimal(row[key]).isFinite())
      )
        throw new Error(`Invalid amount: ${key}`);
  }
  return p;
}
export function validateReport(value: unknown, prime: Prime): Report {
  const r = value as Report;
  if (
    !r ||
    r.schema_version !== "2.0" ||
    r.prime !== prime ||
    r.view !== "reporting" ||
    r.estimate_basis !== "month_to_date" ||
    typeof r.freshness?.stale !== "boolean" ||
    !isoDate.test(r.freshness?.expected_cutoff) ||
    !isoDate.test(r.freshness?.actual_cutoff)
  )
    throw new Error("Invalid reporting response");
  validatePublication(r.data);
  return r;
}
export function money(value: string | null | undefined): string {
  if (value == null) return "TBD";
  const amount = new Decimal(value);
  const parts = amount.abs().toFixed(2).split(".");
  const formatted = `$${parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${parts[1]}`;
  return amount.isNegative() && !amount.isZero() ? `(${formatted})` : formatted;
}
export function amount(row: Venue, field: MoneyField): string | null {
  // A known cash receipt remains useful even when the loan's accrual is unavailable.
  return row.enabled &&
    (row.status === "available" ||
      (field === "cash_received_usd" && row.status === "unavailable"))
    ? row[field]
    : null;
}
export function accruedIncome(row: Venue): string | null {
  // `existing` does not certify accrual recognition. Never infer it from a label.
  return row.method === "loan_accrual" ? amount(row, "income_usd") : null;
}
export function loanIncomeBalances(row: Venue): {
  interestReceivable: string | null;
  incomeReceivedInAdvance: string | null;
} {
  const unpaid =
    row.method === "loan_accrual" ? amount(row, "unpaid_income_usd") : null;
  if (unpaid === null)
    return { interestReceivable: null, incomeReceivedInAdvance: null };
  const balance = new Decimal(unpaid);
  // An advance receipt is a separate credit balance, not a negative asset.
  return {
    interestReceivable: balance.isNegative() ? "0" : unpaid,
    incomeReceivedInAdvance: balance.isNegative()
      ? balance.abs().toString()
      : "0",
  };
}
export function dailyChange(
  current: Publication | undefined,
  previous: Publication | undefined,
  id: string,
  accrual = false,
): string | null {
  if (!current) return null;
  const row = current.result.venues.find((v) => v.venue_id === id);
  if (!row) return null;
  const income = accrual ? accruedIncome(row) : amount(row, "income_usd");
  if (income === null) return null;
  if (current.cutoff.endsWith("-01")) return income;
  const priorDay = new Date(`${current.cutoff}T00:00:00Z`);
  priorDay.setUTCDate(priorDay.getUTCDate() - 1);
  if (
    !previous ||
    previous.cutoff !== priorDay.toISOString().slice(0, 10) ||
    current.result.period.start !== previous.result.period.start
  )
    return null;
  const before = previous.result.venues.find((v) => v.venue_id === id);
  if (!before || before.method !== row.method || before.enabled !== row.enabled)
    return null;
  const prior = accrual ? accruedIncome(before) : amount(before, "income_usd");
  return prior === null ? null : new Decimal(income).minus(prior).toString();
}
export function period(month: string | undefined, now = new Date()) {
  const yesterday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const latestMonth = yesterday.toISOString().slice(0, 7);
  const selected =
    month &&
    /^\d{4}-(0[1-9]|1[0-2])$/.test(month) &&
    month >= "2020-01" &&
    month <= latestMonth
      ? month
      : latestMonth;
  const end = new Date(`${selected}-01T00:00:00Z`);
  end.setUTCMonth(end.getUTCMonth() + 1, 0);
  const cutoff =
    selected === latestMonth
      ? yesterday.toISOString().slice(0, 10)
      : end.toISOString().slice(0, 10);
  return { month: selected, start: `${selected}-01`, cutoff, latestMonth };
}
export const cleanLabel = (label: string) =>
  label
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/Category [A-Z]\s*[—–-]?\s*/g, "")
    .trim();

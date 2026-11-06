import {
  rollupPolicies,
  rwaPolicies,
  offchainPolicy,
  offchainPolicies,
  archivePolicies,
  sparkIncomePolicies,
  sparkAmmPolicies,
  sparkStatementPolicies,
  sparkHistoryPolicy,
  sparkHistoryPolicies,
  sparkReconciledPolicy,
} from "./financial-policies.ts";
export {
  rollupPolicy,
  rwaPolicy,
  rwaPolicies,
  allocationRewardsPolicy,
  offchainPolicy,
} from "./financial-policies.ts";
import type { Prime, Venue } from "./reporting.ts";
import { yearMonths, type Month, type PortfolioRow } from "./prime-reports.ts";
import Decimal from "decimal.js";

export const sparkAmmIds = [
  "investment.amm.uniswap_v4.pyusd_usds",
  "investment.amm.uniswap_v4.usdt_usds",
  "investment.amm.uniswap_v4.rlusd_usds",
  "investment.amm.curve.susds_usdt",
  "investment.amm.curve.pyusd_usds",
];

export interface Metric {
  value: string | null;
  known_value: string | null;
  status: "available" | "unavailable" | "partial" | "future";
  unit: "USD";
  recognition: string;
  basis: string;
  reason: string | null;
  source_paths: string[];
  source_ref?: string;
  input_revision?: string;
  source_refs?: string[];
  missing_components?: string[];
  component_ids?: string[];
  quality?: "supported" | "estimate";
  period_start?: string;
  period_end?: string;
  source_currency?: string;
  conversion?: string;
  allocation_split?: {
    gross_income_usd: string;
    sky_income_usd: string;
    prime_income_usd: string;
    sky_share: string;
    sky_share_basis:
      | "published_rounded_percentage"
      | "saved_source_share"
      | "not_applicable_empty_position"
      | "effective_dated_designated_exposure";
    rounding_delta_usd: string;
    sky_share_excluded_income_usd?: string;
  };
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
    monthly_revision?: string | null;
    offchain_revision?: string | null;
    reconciliation_revision?: string | null;
  }[];
  lines: {
    id: string;
    label: string;
    family?: string;
    aggregation?: "leaf" | "subtotal";
    components?: { id: string; sign: 1 | -1 }[];
    published_override?: string;
    values: Record<string, Metric>;
    total: Metric;
  }[];
  source_manifest: Record<
    string,
    {
      cutoff: string;
      revision_id: string;
      result_hash: string;
      kind?:
        | "published_monthly_summary"
        | "counterparty_monthly_accrual"
        | "counterparty_monthly_archive"
        | "spark_onchain_components"
        | "spark_reviewed_chain_cash";
      month?: string;
      snapshot_revision?: string;
      repository?: string;
      commit?: string;
      path?: string;
      url?: string;
      currency?: string;
      display_precision?: string;
    }
  >;
  offchain_positions?: OffchainPosition[];
  archive_income?: ArchiveIncome[];
  source_lag_periods: string[];
  spark_msc_reconciliation?: SparkMscMonth[];
  spark_fee_true_up_control?: { amount: string | null; treatment: string; reporting_original_months: Metric; difference: Metric; added_to_reporting_income: false };
  display_decimals?: number;
  // Local dashboard presentation only; never part of an API publication/hash.
  dashboard_composition?: {
    policy_version: string;
    expense_revision: string;
    expense_source: { file: string; sheet: string; sha256: string; data_file: string };
    api_report_hash: string | null;
    api_selection: string | null;
    display_hash: string;
    local_metric_ids: string[];
    totals_through?: string;
  };
  pending_expense_inputs?: { id: string; reason: string }[];
  accounting_rules?: string;
  expense_input_revision?: string;
  statement_rows?: {
    id: string;
    label: string;
    parent: string | null;
    depth: number;
    kind: "section" | "subtotal" | "total" | null;
    metric_id: string | null;
  }[];
}
export interface ArchiveIncome {
  id: string;
  line_id: string | null;
  label: string;
  month: string;
  included_in_totals: boolean;
  balances?: Record<string, Metric>;
  metric: Metric;
}
export interface OffchainPosition {
  source_venue_id: string;
  label: string;
  values: Record<
    string,
    {
      component: string;
      source_venue_id: string;
      position_id: string;
      label: string;
      period_start: string;
      period_end: string;
      metrics: Record<string, Metric>;
    }
  >;
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
  claims?: {
    source_venue_id: string;
    label: string;
    income: Metric;
    cash_received: Metric;
    receivable: Metric;
    received_in_advance: Metric;
    included_in_allocation_value: false;
  }[];
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
      label: string;
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
const policies = new Set([
  "prime-management.first-slice.v1",
  "prime-management.allocations.v2",
  "prime-management.allocations.v2.1",
]);
const monthlyPolicy = "prime-management.monthly-statements.v3";
const hash = (v: unknown) => typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
const decimal = (v: unknown) =>
  typeof v === "string" && /^-?\d+(?:\.\d+)?(?:[Ee][+-]?\d+)?$/.test(v);
const SplitDecimal = Decimal.clone({ precision: 60 });
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
  requireValue(v.source_ref === undefined || hash(v.source_ref));
  requireValue(
    v.source_refs === undefined ||
      (Array.isArray(v.source_refs) &&
        v.source_refs.every(hash) &&
        new Set(v.source_refs).size === v.source_refs.length),
  );
  requireValue(
    v.missing_components === undefined ||
      (Array.isArray(v.missing_components) &&
        v.missing_components.every(
          (id) => typeof id === "string" && id.length > 0,
        )),
  );
  requireValue(
    v.quality === undefined || ["supported", "estimate"].includes(v.quality),
  );
  if (v.period_start !== undefined || v.period_end !== undefined)
    requireValue(
      date(v.period_start) &&
        date(v.period_end) &&
        v.period_start! <= v.period_end!,
    );
  if (v.allocation_split !== undefined) {
    const split = v.allocation_split;
    requireValue(split && typeof split === "object" && !Array.isArray(split));
    requireValue(
      (
        [
          "gross_income_usd",
          "sky_income_usd",
          "prime_income_usd",
          "sky_share",
          "rounding_delta_usd",
        ] as const
      ).every(
        (key) => decimal(split[key]) && new SplitDecimal(split[key]).isFinite(),
      ),
    );
    requireValue(
      ["published_rounded_percentage", "saved_source_share", "not_applicable_empty_position", "effective_dated_designated_exposure"].includes(
        split.sky_share_basis,
      ),
    );
    if (split.sky_share_excluded_income_usd !== undefined)
      requireValue(
        decimal(split.sky_share_excluded_income_usd) &&
          new SplitDecimal(split.sky_share_excluded_income_usd).gte(0),
      );
  }
}
export const archiveLineIds = new Set([
  "investment.morpho.grove_monad_ausd",
  "rewards.issuer.agora",
  "rewards.issuer.usdg",
  "rewards.partnership.plume",
  "gains.plume_disposal",
  "rewards.lending.aave.eth_rlusd",
  "rewards.lending.aave.horizon_rlusd",
]);
function validateArchive(v: FinancialStatement, prime: Prime) {
  requireValue(
    Array.isArray(v.archive_income) &&
      (prime === "grove" || !v.archive_income.length),
  );
  const ids = new Set<string>();
  for (const row of v.archive_income!) {
    const p = v.periods.find((p) => p.key === row.month);
    requireValue(
      typeof row.id === "string" &&
        typeof row.label === "string" &&
        p &&
        p.state !== "future" &&
        p.offchain_revision,
    );
    const key = `${row.month}:${row.id}`;
    requireValue(!ids.has(key));
    ids.add(key);
    metric(row.metric);
    const m = row.metric;
    requireValue(
      m.source_ref === p.offchain_revision &&
        m.period_start === `${row.month}-01` &&
        m.period_end === p.expected_cutoff &&
        ["supported", "estimate"].includes(m.quality!) &&
        typeof m.source_currency === "string" &&
        typeof m.conversion === "string" &&
        typeof row.included_in_totals === "boolean",
    );
    requireValue((row.id === "monad") === (row.balances !== undefined));
    if (row.balances !== undefined) {
      requireValue(row.id === "monad");
      for (const key of [
        "opening_value",
        "closing_value",
        "deposits",
        "withdrawals",
      ]) {
        metric(row.balances[key]);
        requireValue(
          row.balances[key].source_ref === m.source_ref &&
            row.balances[key].quality === "estimate" &&
            row.balances[key].source_currency === "AUSD" &&
            row.balances[key].period_start === m.period_start &&
            row.balances[key].period_end === m.period_end &&
            row.balances[key].status === "available" &&
            new SplitDecimal(row.balances[key].value!).gte(0),
        );
      }
      const b = row.balances;
      requireValue(
        new SplitDecimal(b.closing_value.value!)
          .minus(b.opening_value.value!)
          .minus(b.deposits.value!)
          .plus(b.withdrawals.value!)
          .minus(metricAmount(m)!)
          .abs()
          .lte("1e-18"),
      );
    }
    if (row.included_in_totals) {
      requireValue(row.line_id && archiveLineIds.has(row.line_id));
      const cell = v.lines.find((l) => l.id === row.line_id)?.values[row.month];
      requireValue(cell && JSON.stringify(cell) === JSON.stringify(m));
      requireValue(
        !["estimated_accrual", "recorded_change"].includes(m.recognition),
      );
    } else
      requireValue(
        row.line_id === null &&
          ["estimated_accrual", "recorded_change"].includes(m.recognition) &&
          m.quality === "estimate",
      );
  }
  // Every new archive-sourced leaf must have one and only one schedule member.
  for (const line of v.lines)
    for (const p of v.periods) {
      const m = line.values[p.key];
      if (
        archiveLineIds.has(line.id) &&
        m.source_ref &&
        m.source_ref === p.offchain_revision &&
        v.source_manifest[m.source_ref].kind === "counterparty_monthly_archive"
      )
        requireValue(
          v.archive_income!.filter(
            (r) =>
              r.included_in_totals &&
              r.line_id === line.id &&
              r.month === p.key,
          ).length === 1,
        );
    }
}

function offchainSourceKind(policy: string, prime: Prime, kind?: string) {
  if (prime === "spark" && sparkIncomePolicies.includes(policy))
    return kind === "spark_onchain_components";
  return (
    prime === "grove" &&
    (kind === "counterparty_monthly_accrual" ||
      (archivePolicies.includes(policy) &&
        kind === "counterparty_monthly_archive"))
  );
}
function validateOffchain(v: FinancialStatement, prime: Prime) {
  requireValue(Array.isArray(v.offchain_positions));
  const identities: Record<string, [string, string]> = {
    E21: ["gaclo", "GACLO1"],
    E42: ["warehouse", "GLXYWH"],
  };
  requireValue(v.offchain_positions!.length === (prime === "grove" ? 2 : 0));
  requireValue(
    new Set(v.offchain_positions!.map((p) => p.source_venue_id)).size ===
      v.offchain_positions!.length,
  );
  for (const p of v.periods)
    if (p.offchain_revision) {
      const source = v.source_manifest[p.offchain_revision];
      requireValue(
        p.state !== "future" &&
          source &&
          offchainSourceKind(v.policy_version, prime, source.kind) &&
          source.revision_id === p.offchain_revision &&
          hash(source.result_hash) &&
          source.currency === "USD" &&
          source.cutoff.startsWith(p.key) &&
          source.cutoff <= p.expected_cutoff!,
      );
    }
  for (const position of v.offchain_positions!) {
    const identity = identities[position.source_venue_id];
    requireValue(
      identity && typeof position.label === "string" && position.values,
    );
    for (const [month, row] of Object.entries(position.values)) {
      const period = v.periods.find((p) => p.key === month);
      requireValue(
        period &&
          period.state !== "future" &&
          period.offchain_revision &&
          row.source_venue_id === position.source_venue_id &&
          row.component === identity[0] &&
          row.position_id === identity[1] &&
          row.period_start === `${month}-01` &&
          date(row.period_end) &&
          row.period_end <= v.source_manifest[period.offchain_revision].cutoff,
      );
      for (const key of [
        "opening_principal",
        "principal_additions",
        "principal_returns",
        "closing_principal",
        "earned_income",
        "cash_received",
        "opening_receivable",
        "closing_receivable",
        "fees",
        "adjustments",
        "valuation_changes",
      ]) {
        const item = row.metrics[key];
        metric(item);
        requireValue(
          item.source_ref === period.offchain_revision &&
            item.period_start === row.period_start &&
            item.period_end === row.period_end &&
            ["supported", "estimate"].includes(item.quality!),
        );
      }
      const income = v.lines.find(
        (l) => l.id === `investment.offchain.${identity[0]}`,
      )?.values[month];
      requireValue(
        income &&
          JSON.stringify(income) === JSON.stringify(row.metrics.earned_income),
      );
      const amount = (key: string) =>
        new SplitDecimal(metricAmount(row.metrics[key])!);
      requireValue(
        amount("opening_principal")
          .plus(amount("principal_additions"))
          .minus(amount("principal_returns"))
          .minus(amount("closing_principal"))
          .abs()
          .lte("0.01"),
      );
      requireValue(
        amount("opening_receivable")
          .plus(amount("earned_income"))
          .minus(amount("cash_received"))
          .plus(amount("adjustments"))
          .minus(amount("closing_receivable"))
          .abs()
          .lte("0.01"),
      );
    }
  }
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
      v.dashboard_composition === undefined &&
      (policies.has(v.policy_version) ||
        [monthlyPolicy, ...rollupPolicies].includes(v.policy_version)) &&
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
  const monthly = [monthlyPolicy, ...rollupPolicies].includes(v.policy_version);
  const offchain = offchainPolicies.includes(v.policy_version);
  const refs = (p: FinancialStatement["periods"][number]) => [
    p.financial_revision,
    p.monthly_revision,
    ...(offchain ? [p.offchain_revision] : []),
    ...(v.policy_version === sparkReconciledPolicy ? [p.reconciliation_revision] : []),
  ];
  const validSource = (
    ref: string,
    p: FinancialStatement["periods"][number],
  ) => {
    const source = v.source_manifest?.[ref];
    return (
      refs(p).includes(ref) &&
      source &&
      (ref === p.reconciliation_revision
        ? prime === "spark" && v.policy_version === sparkReconciledPolicy && source.kind === "spark_reviewed_chain_cash" && source.month === p.key && hash(source.snapshot_revision) && source.cutoff === p.expected_cutoff
        : ref === p.offchain_revision
        ? offchainSourceKind(v.policy_version, prime, source.kind) &&
          date(source.cutoff) &&
          source.cutoff.startsWith(p.key) &&
          source.cutoff <= p.expected_cutoff!
        : source.cutoff === p.actual_cutoff)
    );
  };
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
        (p.financial_revision === null || hash(p.financial_revision)) &&
        (!monthly || p.monthly_revision === null || hash(p.monthly_revision)) &&
        (!offchain ||
          p.offchain_revision === null ||
          hash(p.offchain_revision)),
    );
    requireValue(
      (p.actual_cutoff === null) ===
        (p.financial_revision === null &&
          (!monthly || p.monthly_revision === null) &&
          (!offchain || p.offchain_revision === null)),
    );
    requireValue(
      p.actual_cutoff === null ||
        (date(p.actual_cutoff) &&
          bounds.cutoff &&
          p.actual_cutoff.startsWith(bounds.key) &&
          p.actual_cutoff <= bounds.cutoff &&
          (bounds.state !== "complete" ||
            p.actual_cutoff === bounds.cutoff ||
            (offchain &&
              p.financial_revision === null &&
              p.monthly_revision === null &&
              p.offchain_revision !== null))),
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
    requireValue(
      typeof l.id === "string" &&
        (l.family === undefined || typeof l.family === "string") &&
        (l.aggregation === undefined ||
          ["leaf", "subtotal"].includes(l.aggregation)),
    );
    metric(l.total);
    const completeSpark =
      prime === "spark" && sparkStatementPolicies.includes(v.policy_version);
    const derived =
      rollupPolicies.includes(v.policy_version) &&
      (l.id.startsWith("statement.") ||
        (v.policy_version === sparkReconciledPolicy && (l.id === "gains.sparklend_nonstable" || (["revaluation.sparklend_assets", "funding.sky.net"].includes(l.id) && Array.isArray(l.components)))) ||
        (completeSpark &&
          ((l.id.startsWith("funding.savings") &&
            l.aggregation === "subtotal") ||
            (sparkAmmIds.includes(l.id) &&
              Object.values(l.values).some((c) =>
                Array.isArray(c.source_refs),
              )))) ||
        (sparkIncomePolicies.includes(v.policy_version) &&
          ["fees.sparklend", "fees.curator"].includes(l.id)) ||
        (sparkIncomePolicies.includes(v.policy_version) &&
          l.id.startsWith("investment.") &&
          Array.isArray(l.components)) ||
        (rwaPolicies.includes(v.policy_version) &&
          l.id === "investment.reviewed_income" &&
          Array.isArray(l.components)));
    if (derived && !(completeSpark && sparkAmmIds.includes(l.id)))
      requireValue(
        Array.isArray(l.components) &&
          l.components.length > 0 &&
          l.components.every(
            (c) => typeof c.id === "string" && [1, -1].includes(c.sign),
          ) &&
          new Set(l.components.map((c) => c.id)).size === l.components.length,
      );
    for (const p of v.periods) {
      const cell = l.values[p.key];
      metric(cell);
      requireValue((cell.status === "future") === (p.state === "future"));
      if (v.policy_version === sparkReconciledPolicy && l.id === "expenses.compensation.spk") {
        requireValue(hash(v.expense_input_revision) && cell.input_revision === v.expense_input_revision);
        continue; // Authored expense input has its own revision, not an unrelated chain publication.
      }
      requireValue(
        p.financial_revision !== null ||
          (monthly && p.monthly_revision !== null) ||
          (offchain && p.offchain_revision !== null) ||
          (cell.value === null && cell.known_value === null),
      );
      if (
        monthly &&
        derived &&
        !(completeSpark && sparkAmmIds.includes(l.id) && !cell.source_refs) &&
        (cell.value !== null || cell.known_value !== null)
      ) {
        requireValue(
          Array.isArray(cell.source_refs) &&
            cell.source_refs.length > 0 &&
            cell.source_refs.every((ref) => validSource(ref, p)),
        );
      } else if (
        monthly &&
        (cell.value !== null || cell.known_value !== null)
      ) {
        requireValue(cell.source_ref && refs(p).includes(cell.source_ref));
        const source = v.source_manifest?.[cell.source_ref];
        requireValue(source && validSource(cell.source_ref, p));
        if (cell.source_ref === p.offchain_revision)
          requireValue(
            offchain &&
              ((prime === "spark" &&
                sparkIncomePolicies.includes(v.policy_version) &&
                (l.id.startsWith("fees.") ||
                  (v.policy_version === sparkReconciledPolicy && l.id.startsWith("revaluation.")) ||
                  l.id.startsWith("gains.") ||
                  l.id.startsWith("investment.venue.") ||
                  (completeSpark &&
                    (l.id.startsWith("funding.savings.venue.") ||
                      l.id.startsWith("investment.susds.") ||
                      [
                        "investment.sparklend.weth",
                        "investment.morpho.sentora_rlusd",
                      ].includes(l.id))) ||
                  l.id.startsWith("rewards.treasury.") ||
                  l.id === "funding.sky.sde_adjustment" ||
                  l.id === "funding.sky.retained" ||
                  l.id.startsWith("rewards.lending.sparklend.") ||
                  l.id === "rewards.unattributed_sparklend_receipts" ||
                  (sparkHistoryPolicies.includes(v.policy_version) &&
                    (l.id === "investment.anchorage" ||
                      l.id.startsWith("rewards.issuer.") ||
                      sparkAmmIds.includes(l.id))))) ||
                (prime === "grove" &&
                  ([
                    "investment.offchain.gaclo",
                    "investment.offchain.warehouse",
                  ].includes(l.id)
                    ? cell.recognition === "accrual"
                    : archivePolicies.includes(v.policy_version) &&
                      archiveLineIds.has(l.id)))) &&
              ["supported", "estimate"].includes(cell.quality!) &&
              cell.period_start === `${p.key}-01` &&
              date(cell.period_end) &&
              cell.period_end! <= source.cutoff,
          );
        if (
          rwaPolicies.includes(v.policy_version) &&
          (["investment.rwa.stac", "investment.rwa.jaaa"].includes(l.id) ||
            (prime === "spark" &&
              sparkAmmPolicies.includes(v.policy_version) &&
              sparkAmmIds.includes(l.id)))
        ) {
          const split = cell.allocation_split;
          requireValue(split && cell.recognition === "investment_return");
          const rounded = source.kind === "published_monthly_summary";
          const emptyPosition =
            sparkHistoryPolicies.includes(v.policy_version) &&
            source.kind === "spark_onchain_components" &&
            split.sky_share_basis === "not_applicable_empty_position" &&
            [
              split.gross_income_usd,
              split.prime_income_usd,
              split.sky_income_usd,
              cell.value,
            ].every((n) => n !== null && new SplitDecimal(n!).eq(0));
          requireValue(
            emptyPosition ||
              (v.policy_version === sparkReconciledPolicy && source.kind === "spark_onchain_components"
                && split.sky_share_basis === "effective_dated_designated_exposure") ||
              split.sky_share_basis ===
                (rounded
                  ? "published_rounded_percentage"
                  : "saved_source_share"),
          );
          requireValue(
            new SplitDecimal(split.prime_income_usd).eq(
              cell.value ?? cell.known_value!,
            ),
          );
          requireValue(
            split.sky_share_basis === "effective_dated_designated_exposure" ||
              (new SplitDecimal(split.sky_share).gte(0) && new SplitDecimal(split.sky_share).lte(1)),
          );
          const delta = new SplitDecimal(split.gross_income_usd)
            .minus(split.prime_income_usd)
            .minus(split.sky_income_usd);
          requireValue(
            (delta.eq(split.rounding_delta_usd) ||
              // Python Decimal's saved 28-digit split can differ by tiny
              // sub-wei USD dust when re-added at the reader's precision.
              (v.policy_version === sparkReconciledPolicy &&
                source.kind === "spark_onchain_components" &&
                split.sky_share_basis === "effective_dated_designated_exposure" &&
                delta.minus(split.rounding_delta_usd).abs().lte("1e-18"))) &&
              delta.abs().lte(rounded ? "0.015" : "1e-12"),
          );
          if (split.sky_share_excluded_income_usd !== undefined) {
            requireValue(
              prime === "spark" &&
                sparkAmmPolicies.includes(v.policy_version) &&
                l.id === "investment.amm.curve.susds_usdt",
            );
            requireValue(
              new SplitDecimal(split.gross_income_usd)
                .minus(split.sky_share_excluded_income_usd)
                .times(split.sky_share)
                .minus(split.sky_income_usd)
                .abs()
                .lte(rounded ? "0.03" : "1e-12"),
            );
          }
        }
        if (cell.source_ref === p.reconciliation_revision)
          requireValue(v.policy_version === sparkReconciledPolicy && l.id === "investment.anchorage" && cell.recognition === "receipt" && cell.period_start === p.key + "-01" && cell.period_end === p.expected_cutoff);
        if (cell.source_ref === p.monthly_revision)
          requireValue(
            [
              ...(sparkHistoryPolicies.includes(v.policy_version) &&
              prime === "spark" &&
              (l.id.startsWith("investment.venue.") ||
                l.id.startsWith("investment.rwa.") ||
                l.id.startsWith("investment.susds.") ||
                l.id.startsWith("rewards.lending.aave."))
                ? [l.id]
                : []),
              ...(v.policy_version === sparkReconciledPolicy && l.id === "investment.psm3.susds" ? [l.id] : []),
              "demand.agent_rate",
              "demand.distribution_rewards",
              "demand.total",
              "funding.sky.net",
              ...(v.policy_version === sparkReconciledPolicy ? ["funding.sky.retained"] : []),
              ...(prime === "skybase" ? ["demand.gar"] : []),
              ...(prime === "grove" ? ["demand.chronicle_points"] : []),
              ...(prime === "spark" &&
              sparkAmmPolicies.includes(v.policy_version)
                ? sparkAmmIds
                : []),
              ...(prime === "grove" && rwaPolicies.includes(v.policy_version)
                ? ["investment.rwa.stac", "investment.rwa.jaaa"]
                : []),
            ].includes(l.id),
          );
      }
    }
    requireValue(
      l.total.value === null ||
        v.periods
          .filter((p) => p.state !== "future")
          .every((p) => l.values[p.key].status === "available"),
    );
  }
  if (prime === "spark" && sparkStatementPolicies.includes(v.policy_version)) {
    requireValue(
      v.display_decimals === 0 &&
        Array.isArray(v.statement_rows) &&
        v.statement_rows.length > 0,
    );
    const layout = v.statement_rows!;
    const ids = new Set<string>();
    for (const row of layout) {
      requireValue(
        row &&
          typeof row.id === "string" &&
          !ids.has(row.id) &&
          typeof row.label === "string" &&
          Number.isInteger(row.depth) &&
          row.depth >= 0 &&
          [null, "section", "subtotal", "total"].includes(row.kind),
      );
      if (row.parent !== null) {
        const parent = layout.find((r) => r.id === row.parent);
        requireValue(
          ids.has(row.parent) && parent && row.depth === parent.depth + 1,
        );
      }
      requireValue(
        row.kind === "section"
          ? row.metric_id === null
          : typeof row.metric_id === "string" &&
              v.lines.some((l) => l.id === row.metric_id),
      );
      ids.add(row.id);
    }
    for (const id of sparkAmmIds) {
      const line = v.lines.find((l) => l.id === id);
      requireValue(line);
      for (const period of v.periods) {
        const cell = line.values[period.key];
        if (
          !cell.source_refs ||
          (cell.value === null && cell.known_value === null)
        )
          continue;
        requireValue(
          cell.source_refs.length === 2 &&
            cell.source_refs.some(
              (ref) =>
                ref === period.financial_revision ||
                ref === period.monthly_revision,
            ) &&
            cell.source_refs.includes(period.offchain_revision!),
        );
        const split = cell.allocation_split;
        requireValue(
          split &&
            new SplitDecimal(split.prime_income_usd).eq(
              cell.value ?? cell.known_value!,
            ),
        );
        requireValue(
          new SplitDecimal(split.gross_income_usd)
            .minus(split.sky_income_usd)
            .eq(split.prime_income_usd),
        );
        requireValue(
          new SplitDecimal(split.sky_share).gte(0) &&
            new SplitDecimal(split.sky_share).lte(1),
        );
      }
    }
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
  if (monthly)
    for (const p of v.periods)
      if (p.monthly_revision) {
        const s = v.source_manifest[p.monthly_revision];
        requireValue(
          p.state === "complete" &&
            s &&
            s.kind === "published_monthly_summary" &&
            s.cutoff === p.actual_cutoff &&
            s.cutoff === p.expected_cutoff &&
            s.revision_id === p.monthly_revision &&
            hash(s.result_hash) &&
            s.repository === "soterlabs/settlement-reports" &&
            typeof s.commit === "string" &&
            /^[a-f0-9]{40}$/.test(s.commit) &&
            s.path === `reports/${prime}/${p.key}/summary.md` &&
            s.url ===
              `https://github.com/${s.repository}/blob/${s.commit}/${s.path}` &&
            s.currency === "USDS" &&
            s.display_precision === "0.01",
        );
      }
  if (offchain) validateOffchain(v, prime);
  if (archivePolicies.includes(v.policy_version)) validateArchive(v, prime);

  if (v.policy_version === sparkReconciledPolicy) validateSparkMsc(v);
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
      policies.has(v.policy_version) &&
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
        typeof position.position_id === "string" &&
        typeof position.label === "string",
    );
    metric(position.income);
    metric(position.opening_value);
    metric(position.closing_value);
  }
  if (v.claims !== undefined) {
    requireValue(Array.isArray(v.claims));
    requireValue(
      new Set(v.claims.map((c) => c.source_venue_id)).size === v.claims.length,
    );
    for (const claim of v.claims) {
      requireValue(
        typeof claim.source_venue_id === "string" &&
          typeof claim.label === "string" &&
          claim.included_in_allocation_value === false,
      );
      for (const m of [
        claim.income,
        claim.cash_received,
        claim.receivable,
        claim.received_in_advance,
      ])
        metric(m);
    }
  }
  return v;
}
const bindings: Record<string, string> = {
  demand: "demand.total",
  dr: "demand.distribution_rewards",
  gar: "demand.gar",
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
  const rollups: Record<string, string> = {
    demand: "statement.demand",
    interest: "statement.interest",
    rewards: "statement.rewards",
    "noninterest-income": "statement.noninterest_income",
    "interest-expense": "statement.funding",
    "net-interest": "statement.net_interest",
    "net-revenue": "statement.net_revenue",
    "noninterest-expense": "statement.noninterest_expense",
    "net-income": "statement.net_income",
    gains: "statement.gains",
    protocol: "fees.sparklend",
    curator: "fees.curator",
    "allocation-0": "statement.family.sparklend",
    "allocation-1": "statement.family.aave_v3",
    "allocation-2": "statement.family.morpho_vaults",
    "allocation-3": "statement.family.maple",
    "allocation-4": "statement.family.arkis",
  };
  if (report && rollupPolicies.includes(report.policy_version) && rollups[id])
    return report.lines.find((l) => l.id === rollups[id]);
  return report?.lines.find((l) => l.id === (bindings[id] || id));
}

export function metricExplanation(
  item?: Metric,
  report?: FinancialStatement | null,
  labels?: Record<string, string>,
) {
  if (!item) return "Classification or inputs not yet available";
  if (item.status === "future") return "Future period; no forecast";
  const missing = item.missing_components
    ?.map(
      (id) =>
        labels?.[id] ||
        report?.lines.find((line) => line.id === id)?.label ||
        id
          .replace(/^(unclassified|statement)\./, "")
          .replaceAll("_", " ")
          .replaceAll(".", " · "),
    )
    .join(", ");
  const estimate =
    item.quality === "estimate"
      ? `Estimate${item.period_end ? ` through ${item.period_end}` : " included"}. `
      : "";
  if (item.status === "partial")
    return (
      estimate +
      `Sum of available amounts; this is not a complete total. Missing: ${missing || "some periods or components"}.`
    );
  if (item.status === "unavailable" && missing)
    return `Unavailable: no confirmed amount. Missing: ${missing}.`;
  return (
    estimate +
    (item.reason?.replaceAll("_", " ") || item.basis.replaceAll("_", " ")) +
    (item.period_end ? ` · Through ${item.period_end}` : "")
  );
}

// Presentation only: preserve the API's coverage/recognition metadata while
// showing its signed available sum, including genuine zeroes and losses.
export function metricAmount(item?: Metric | null): string | null {
  if (!item || item.status === "future") return null;
  return item.value ?? (item.status === "partial" ? item.known_value : null);
}

export function statementMonthNote(
  month: Month,
): string | null {
  return month.state === "partial" ? "MTD" : null;
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
  return report?.total_label ?? fallback.replace(/\s+\d{4}$/, "");
}

export function positionAccruedIncome(
  report: FinancialPortfolio | null | undefined,
  venue: Venue,
) {
  const metric =
    report?.portfolio.positions.find(
      (p) => p.source_venue_id === venue.venue_id,
    )?.income ||
    report?.claims?.find((p) => p.source_venue_id === venue.venue_id)?.income;
  if (metric)
    return metric.status === "available" && metric.recognition === "accrual"
      ? metric.value
      : null;
  return venue.method === "loan_accrual" &&
    venue.enabled &&
    venue.status === "available"
    ? venue.income_usd
    : null;
}

// Approved v3 members remain usable when a legacy source has no v2 publication.
export function financialPortfolioRows(
  prime: Prime,
  venueRows: PortfolioRow[],
  report?: FinancialPortfolio | null,
): PortfolioRow[] {
  if (venueRows.length || !report) return venueRows;
  return report.portfolio.positions
    .filter((p) =>
      [p.opening_value, p.closing_value, p.income].some(
        (m) => m.value !== null,
      ),
    )
    .map((p) => ({
      prime,
      actualCutoff: report.cutoff,
      revision: report.source.revision_id,
      venue: {
        venue_id: p.source_venue_id,
        label: p.label,
        chain: "saved financial source",
        method: "financial_policy",
        enabled: true,
        status: "available",
        reason: null,
        opening_position_value_usd: p.opening_value.value,
        position_value_usd: p.closing_value.value,
        income_usd: null,
        cash_received_usd: null,
        principal_usd: null,
        opening_unpaid_income_usd: null,
        unpaid_income_usd: null,
      },
    }));
}


export interface SparkMscMonth {
  month: string; status: "review_required" | "unavailable"; reason: string; source_ref: string | null;
  MSC_supply_side: Metric; MSC_demand_side: Metric; Savings_interest: Metric;
  MSC_supply_less_Savings: Metric; reporting_net_interest: Metric; net_interest_difference: Metric;
  allocation_difference_total: Metric; Sky_funding_difference: Metric; published_summary_rounding: Metric;
  bridged_net_interest: Metric; quantitative_bridge_residual: Metric;
  MSC_total_less_Savings: Metric; reporting_net_revenue: Metric; net_revenue_difference: Metric;
  other_reporting_components: Record<string, Metric>;
  venue_differences: { id: string; label: string; MSC: Metric; reporting: Metric; difference: Metric; reason: string; review_status: "documented_method_difference" | "review_required" }[];
  reviewed_cash_evidence: unknown; principal_included: false; operating_expenses_included: false;
}
function validateSparkMsc(report: FinancialStatement) {
  requireValue(report.prime === "spark" && Array.isArray(report.spark_msc_reconciliation) && report.spark_fee_true_up_control?.added_to_reporting_income === false);
  const rows = report.spark_msc_reconciliation!;
  const elapsed = report.periods.filter(p => p.state !== "future");
  requireValue(rows.length === elapsed.length && new Set(rows.map(r => r.month)).size === rows.length);
  const value = (m: Metric) => metricAmount(m);
  const checkTerms = (result: Metric, terms: [Metric, number][]) => {
    metric(result); terms.forEach(([cell]) => metric(cell));
    const known=terms.filter(([cell])=>value(cell)!==null);
    const expected=known.length ? known.reduce((n,[cell,sign])=>n.plus(new SplitDecimal(value(cell)!).times(sign)),new SplitDecimal(0)) : null;
    requireValue(expected===null ? value(result)===null : value(result)!==null && expected.minus(value(result)!).abs().lte("1e-40"));
    requireValue(result.status === (terms.every(([cell])=>cell.status==="available") ? "available" : known.length ? "partial" : "unavailable"));
  };
  for (const p of elapsed) {
    const row=rows.find(r=>r.month===p.key);requireValue(row && row.principal_included===false && row.operating_expenses_included===false && ["review_required","unavailable"].includes(row.status));
    const b=row!;
    requireValue(b.source_ref===(p.monthly_revision || null));
    requireValue(JSON.stringify(b.reporting_net_interest)===JSON.stringify(report.lines.find(l=>l.id==="statement.net_interest")?.values[p.key]));
    requireValue(JSON.stringify(b.reporting_net_revenue)===JSON.stringify(report.lines.find(l=>l.id==="statement.net_revenue")?.values[p.key]));
    requireValue(JSON.stringify(b.Savings_interest)===JSON.stringify(report.lines.find(l=>l.id==="funding.savings")?.values[p.key]));
    if(b.source_ref){
    checkTerms(b.MSC_supply_less_Savings,[[b.MSC_supply_side,1],[b.Savings_interest,-1]]);
    checkTerms(b.net_interest_difference,[[b.reporting_net_interest,1],[b.MSC_supply_less_Savings,-1]]);
    checkTerms(b.MSC_total_less_Savings,[[b.MSC_supply_side,1],[b.MSC_demand_side,1],[b.Savings_interest,-1]]);
    checkTerms(b.net_revenue_difference,[[b.reporting_net_revenue,1],[b.MSC_total_less_Savings,-1]]);
    } else {
      for(const cell of [b.MSC_supply_less_Savings,b.net_interest_difference,b.MSC_total_less_Savings,b.net_revenue_difference]) {metric(cell);requireValue(cell.status==="unavailable");}
    }
    requireValue(Array.isArray(b.venue_differences) && new Set(b.venue_differences.map(v=>v.id)).size===b.venue_differences.length);
    for(const v of b.venue_differences){requireValue(["documented_method_difference","review_required"].includes(v.review_status));checkTerms(v.difference,[[v.reporting,1],[v.MSC,-1]]);}
    if(b.source_ref){
      checkTerms(b.allocation_difference_total,b.venue_differences.map(v=>[v.difference,1]));
      checkTerms(b.bridged_net_interest,[[b.MSC_supply_less_Savings,1],[b.allocation_difference_total,1],[b.Sky_funding_difference,1],[b.published_summary_rounding,1]]);
      checkTerms(b.quantitative_bridge_residual,[[b.reporting_net_interest,1],[b.bridged_net_interest,-1]]);
    } else {
      for(const cell of [b.bridged_net_interest,b.quantitative_bridge_residual]) {metric(cell);requireValue(cell.status==="unavailable");}
    }
  }
  metric(report.spark_fee_true_up_control!.reporting_original_months);
  metric(report.spark_fee_true_up_control!.difference);
}

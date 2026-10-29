import type { FinancialStatement } from "./financial.ts";
import Decimal from "decimal.js";
import {
  amount,
  accruedIncome,
  name,
  PRIMES,
  type Prime,
  type ReadResult,
  type Venue,
} from "./reporting.ts";

export const API_DOC_URL =
  "https://github.com/soterlabs/settlement-cycle/blob/main/docs/pipeline/settlement-reporting-api.md";
export type Scope = "individual" | "group" | "combined";
export type View = "income" | "positions";
// Consolidated scopes are deliberately unavailable until attribution is supported.
export function individualScope(): Scope {
  return "individual";
}
export function individualReportHref(
  prime: Prime,
  search: Record<string, string | string[] | undefined>,
) {
  const query = new URLSearchParams({ scope: "individual" });
  for (const key of ["year", "view", "month"])
    if (typeof search[key] === "string") query.set(key, search[key]);
  return `/primes/${prime}?${query}`;
}
export const SCOPES: { key: Scope; label: string; description: string }[] = [
  {
    key: "individual",
    label: "Individual prime",
    description: "Prime-agent reporting",
  },
];
export interface Month {
  key: string;
  label: string;
  cutoff: string | null;
  state: "complete" | "partial" | "future";
}
export function reportingYear(value: string | undefined, now = new Date()) {
  const year = Number(value);
  return /^\d{4}$/.test(value || "") &&
    year >= 2020 &&
    year <= now.getUTCFullYear()
    ? year
    : now.getUTCFullYear();
}
export function yearMonths(year: number, now = new Date()): Month[] {
  const yesterday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  )
    .toISOString()
    .slice(0, 10);
  return Array.from({ length: 12 }, (_, index) => {
    const key = `${year}-${String(index + 1).padStart(2, "0")}`;
    const end = new Date(Date.UTC(year, index + 1, 0))
      .toISOString()
      .slice(0, 10);
    return {
      key,
      label: new Date(`${key}-01T00:00:00Z`).toLocaleDateString("en-US", {
        month: "short",
        timeZone: "UTC",
      }),
      cutoff:
        key > yesterday.slice(0, 7) ? null : end > yesterday ? yesterday : end,
      state:
        key > yesterday.slice(0, 7)
          ? "future"
          : end > yesterday
            ? "partial"
            : "complete",
    };
  });
}
export function chooseMonth(months: Month[], requested?: string) {
  return (
    months.find((m) => m.key === requested) ||
    [...months].reverse().find((m) => m.cutoff !== null) ||
    months[0]
  );
}
export function totalLabel(months: Month[]) {
  return months.every((m) => m.state === "complete")
    ? `FY ${months[0].key.slice(0, 4)}`
    : `YTD ${months[0].key.slice(0, 4)}`;
}
export function annualAmount(
  values: (string | null)[],
  months: Month[],
): string | null {
  const required = months
    .map((m, index) => ({ m, value: values[index] }))
    .filter(({ m }) => m.cutoff !== null);
  if (!required.length || required.some(({ value }) => value == null))
    return null;
  return required
    .reduce((sum, { value }) => sum.plus(value!), new Decimal(0))
    .toString();
}
export interface StatementLine {
  id: string;
  label: string;
  level: number;
  kind?: "section" | "subtotal" | "total";
  parent?: string;
  structural?: boolean;
}
export function collapsedStatementGroups(rows: StatementLine[]) {
  return new Set(rows.flatMap((row) => (row.parent ? [row.parent] : [])));
}
const line = (
  id: string,
  label: string,
  level = 1,
  parent?: string,
  kind?: StatementLine["kind"],
): StatementLine => ({ id, label, level, parent, kind });
export function statementLines(
  prime: Prime | null,
  scope: Scope,
  financial?: FinancialStatement | null,
): StatementLine[] {
  const rows: StatementLine[] = [
    line("revenue", "Revenue", 0, undefined, "section"),
    line("demand", "Demand-side revenue"),
    line("dr", "Distribution rewards (DR)", 2, "demand"),
    line("ar", "Agent rate (AR)", 2, "demand"),
    ...(prime === "skybase"
      ? [line("gar", "Governance accessibility rewards (GAR)", 2, "demand")]
      : []),
    line("protocol", "Protocol fees"),
    line("curator", "Curator fees"),
    line("rewards", "Incentives and rewards received"),
    line("gains", "Gains (losses) on non-stable assets, net"),
  ];
  if (prime === "spark")
    rows.push(
      ...["MORPHO", "AVAX", "ETH / WETH", "SparkLend non-USD reserves"].map(
        (s, i) => line(`gain-${i}`, s, 2, "gains"),
      ),
    );
  rows.push(
    line("noninterest-income", "Noninterest income", 0, undefined, "subtotal"),
    line("interest", "Interest income from allocations"),
  );
  if (prime === "spark") {
    const groups: [string, string[]][] = [
      [
        "SparkLend",
        [
          "USDS market",
          "USDC market",
          "USDT market",
          "DAI market",
          "PYUSD market",
          "RLUSD market",
          "WETH market",
        ],
      ],
      [
        "Aave v3",
        [
          "Ethereum USDS",
          "Ethereum Lido USDS",
          "Ethereum USDC",
          "Ethereum USDT",
          "Base USDC",
          "Arbitrum USDCn",
          "Avalanche USDC",
        ],
      ],
      [
        "Morpho vaults",
        [
          "Spark Blue Chip USDC",
          "Spark Blue Chip USDT",
          "Spark DAI",
          "Spark USDS",
          "Spark USDC (Base)",
          "Sentora RLUSD",
        ],
      ],
      ["Maple", ["syrupUSDC", "syrupUSDT"]],
      ["Arkis Spark Prime USDC 1", []],
      ["Anchorage", []],
      ["PYUSD", []],
      ["RLUSD", []],
    ];
    groups.forEach(([label, children], index) => {
      const id = `allocation-${index}`;
      rows.push(line(id, label, 2, "interest"));
      children.forEach((child, i) =>
        rows.push(line(`${id}-${i}`, child, 3, id)),
      );
    });
  }
  if (prime === "obex" && scope === "individual")
    rows.push(
      line(
        "obex-maple",
        "Maple syrupUSDC — net investment income",
        2,
        "interest",
      ),
    );
  rows.push(
    line("interest-expense", "Interest expense (cost of funding)"),
    line("sky-funding", "Sky funding interest, net", 2, "interest-expense"),
    line("net-interest", "Net interest income", 0, undefined, "subtotal"),
    line("net-revenue", "Total net revenue", 0, undefined, "subtotal"),
    line("expenses", "Expenses", 0, undefined, "section"),
    line("operating", "Operating expenses"),
    line("engineering", "Engineering", 2, "operating"),
    line("legal", "Legal", 2, "operating"),
    line("security", "Audits and security", 2, "operating"),
    line("other-operating", "Other operating expenses", 2, "operating"),
    line("other-expenses", "Other expenses"),
  );
  if (prime === "spark")
    rows.push(
      line(
        "licence",
        "Aave profit share (SparkLend licence)",
        2,
        "other-expenses",
      ),
    );
  rows.push(
    line("incentives", "Incentives expense"),
    line("own-token", "Own-token incentives", 2, "incentives"),
    line("stablecoin", "Stablecoin incentives", 2, "incentives"),
    line("distribution", "Distribution costs"),
    line(
      "noninterest-expense",
      "Total noninterest expense",
      0,
      undefined,
      "subtotal",
    ),
  );
  if (scope !== "individual")
    rows.push(
      line("eliminations", "Consolidation and elimination adjustments", 0),
    );
  rows.push(line("net-income", "Net income", 0, undefined, "total"));
  if (
    scope === "individual" &&
    financial?.policy_version === "prime-management.statement-rollups.v3.1"
  ) {
    const base = rows.filter(
      (row) => !row.id.startsWith("allocation-") && row.id !== "obex-maple",
    );
    const inserts = new Map<string, StatementLine[]>();
    const add = (parent: string, row: StatementLine) =>
      inserts.set(parent, [...(inserts.get(parent) || []), row]);
    const groups = new Set<string>();
    for (const definition of financial.lines) {
      if (definition.id === "demand.chronicle_points") {
        add("demand", line(definition.id, definition.label, 2, "demand"));
        continue;
      }
      const parent = definition.id.startsWith("investment.")
        ? "interest"
        : definition.id.startsWith("rewards.")
          ? "rewards"
          : null;
      if (!parent) continue;
      if (definition.aggregation === "subtotal") {
        add(
          parent,
          line(definition.id, definition.label, 2, parent, "subtotal"),
        );
        continue;
      }
      if (
        definition.aggregation !== "leaf" &&
        !(prime === "obex" && definition.id === "investment.maple_syrup_usdc")
      )
        continue;
      const family = definition.family || "Maple";
      const group =
        parent === "interest"
          ? `statement.family.${family.toLowerCase().replaceAll(" ", "_")}`
          : `rewards-${family.toLowerCase().replaceAll(" ", "-")}`;
      if (!groups.has(group)) {
        add(parent, {
          ...line(
            group,
            parent === "interest" ? `Reviewed ${family} income` : family,
            2,
            parent,
          ),
          structural: parent === "rewards",
        });
        groups.add(group);
      }
      add(group, line(definition.id, definition.label, 3, group));
    }
    const expand = (row: StatementLine): StatementLine[] => [
      row,
      ...(inserts.get(row.id) || []).flatMap(expand),
    ];
    return base.flatMap(expand);
  }
  if (
    scope === "individual" &&
    [
      "prime-management.allocations.v2",
      "prime-management.allocations.v2.1",
      "prime-management.monthly-statements.v3",
      "prime-management.statement-rollups.v3.1",
    ].includes(financial?.policy_version || "") &&
    financial
  ) {
    const bindings: Record<string, string> = {
      "allocation-0-0": "investment.sparklend.usds",
      "allocation-0-1": "investment.sparklend.usdc",
      "allocation-0-2": "investment.sparklend.usdt",
      "allocation-0-3": "investment.sparklend.dai",
      "allocation-0-4": "investment.sparklend.pyusd",
      "allocation-1-0": "investment.aave.eth_usds",
      "allocation-1-1": "investment.aave.eth_lido_usds",
      "allocation-1-2": "investment.aave.eth_usdc",
      "allocation-1-3": "investment.aave.eth_usdt",
      "allocation-1-4": "investment.aave.base_usdc",
      "allocation-1-5": "investment.aave.arbitrum_usdc",
      "allocation-1-6": "investment.aave.avalanche_usdc",
      "allocation-2-0": "investment.morpho.blue_chip_usdc",
      "allocation-2-1": "investment.morpho.blue_chip_usdt",
      "allocation-2-2": "investment.morpho.dai",
      "allocation-2-3": "investment.morpho.usds",
      "allocation-2-4": "investment.morpho.base_usdc",
      "allocation-3-0": "investment.maple_syrup_usdc",
      "allocation-3-1": "investment.maple_syrup_usdt",
      "allocation-4": "investment.arkis.usdc",
    };
    const bound = new Set<string>();
    if (prime === "spark")
      for (const row of rows)
        if (bindings[row.id]) {
          row.id = bindings[row.id];
          bound.add(row.id);
        }
    const inserts = new Map<string, StatementLine[]>();
    const add = (parent: string, row: StatementLine) => {
      const group = inserts.get(parent) || [];
      group.push(row);
      inserts.set(parent, group);
    };
    const groups = new Set<string>();
    for (const definition of financial.lines) {
      if (!definition.family || bound.has(definition.id)) continue;
      if (definition.id === "demand.chronicle_points") {
        add("demand", line(definition.id, definition.label, 2, "demand"));
        continue;
      }
      const parent = definition.id.startsWith("investment.")
        ? "interest"
        : definition.id.startsWith("rewards.")
          ? "rewards"
          : null;
      if (!parent) continue;
      if (definition.aggregation === "subtotal") {
        add(
          parent,
          line(definition.id, definition.label, 2, parent, "subtotal"),
        );
        continue;
      }
      const group = `${parent}-${definition.family.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
      if (!groups.has(group)) {
        add(parent, line(group, definition.family, 2, parent));
        groups.add(group);
      }
      add(parent, line(definition.id, definition.label, 3, group));
    }
    const expanded = rows.flatMap((row) => [
      row,
      ...(inserts.get(row.id) || []),
    ]);
    // Family headers with no certified metric are navigation, not missing totals.
    for (const row of expanded) {
      if (
        (row.id.startsWith("interest-") || row.id.startsWith("rewards-")) &&
        expanded.some((child) => child.parent === row.id)
      )
        row.structural = true;
    }
    return expanded;
  }
  return rows;
}
export interface MonthReport {
  month: Month;
  read: ReadResult;
  actualCutoff: string | null;
}
export interface PortfolioRow {
  prime: Prime;
  venue: Venue;
  actualCutoff: string;
  revision: string;
}
export function sourceRows(
  reads: { prime: Prime; read: ReadResult }[],
): PortfolioRow[] {
  return reads.flatMap(
    ({ prime, read }) =>
      read.report?.data.result.venues
        .filter((v) => v.enabled)
        .map((venue) => ({
          prime,
          venue,
          actualCutoff: read.report!.data.cutoff,
          revision: read.report!.data.revision_id,
        })) || [],
  );
}
export function sourceCatalog(monthly: MonthReport[]): Venue[] {
  // Saved publications only; never infer historical allocations from current configuration.
  const rows = new Map<string, Venue>();
  for (const r of monthly)
    for (const v of r.read.report?.data.result.venues || [])
      if (v.enabled) rows.set(v.venue_id, v);
  return [...rows.values()];
}
export function sourceIncome(read: ReadResult, id: string, accrual = false) {
  const row = read.report?.data.result.venues.find((v) => v.venue_id === id);
  return row
    ? accrual
      ? accruedIncome(row)
      : amount(row, "income_usd")
    : null;
}
export function scopeTitle(prime: Prime | null, scope: Scope) {
  return scope === "combined"
    ? "Combined prime agents"
    : `${name(prime || "spark")}${scope === "group" ? " group" : ""}`;
}
export function parsePrime(value: string | null | undefined): Prime | null {
  return PRIMES.includes(value as Prime) ? (value as Prime) : null;
}

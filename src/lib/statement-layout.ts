import type { FinancialStatement } from "./financial.ts";
import type { StatementLine, Scope } from "./prime-reports.ts";
import type { Prime } from "./reporting.ts";
import {
  allocationRewardsPolicies,
  sparkIncomePolicies,
} from "./financial-policies.ts";

type Member = [id: string, label: string];
type Family = [key: string, label: string, members: Member[]];
const investment = (key: string, label: string): Member => [
  `investment.${key}`,
  label,
];
const market = (key: string, label: string) =>
  investment(`sparklend.${key}`, `${label} market`);
const maple: Family = [
  "maple",
  "Maple",
  [
    investment("maple_syrup_usdc", "syrupUSDC"),
    investment("maple_syrup_usdt", "syrupUSDT"),
  ],
];
const spark: Family[] = [
  [
    "sparklend",
    "SparkLend",
    [
      market("usds", "USDS"),
      market("usdc", "USDC"),
      market("usdt", "USDT"),
      market("dai", "DAI"),
      market("pyusd", "PYUSD"),
      market("rlusd", "RLUSD"),
      market("weth", "WETH"),
      market("usdg", "USDG"),
    ],
  ],
  [
    "aave_v3",
    "Aave v3",
    [
      investment("aave.eth_usds", "Ethereum USDS"),
      investment("aave.eth_lido_usds", "Ethereum Lido USDS"),
      investment("aave.eth_usdc", "Ethereum USDC"),
      investment("aave.eth_usdt", "Ethereum USDT"),
      investment("aave.base_usdc", "Base USDC"),
      investment("aave.arbitrum_usdc", "Arbitrum USDCn"),
      investment("aave.avalanche_usdc", "Avalanche USDC"),
    ],
  ],
  [
    "morpho_vaults",
    "Morpho vaults",
    [
      investment("morpho.blue_chip_usdc", "Spark Blue Chip USDC"),
      investment("morpho.blue_chip_usdt", "Spark Blue Chip USDT"),
      investment("morpho.dai", "Spark DAI"),
      investment("morpho.usds", "Spark USDS"),
      investment("morpho.base_usdc", "Spark USDC (Base)"),
      investment("morpho.sentora_rlusd", "Sentora RLUSD"),
    ],
  ],
  [
    "uniswap_v4",
    "Uniswap v4",
    [
      investment("amm.uniswap_v4.pyusd_usds", "PYUSD / USDS"),
      investment("amm.uniswap_v4.usdt_usds", "USDT / USDS"),
      investment("amm.uniswap_v4.rlusd_usds", "RLUSD / USDS"),
    ],
  ],
  [
    "curve",
    "Curve",
    [
      investment("amm.curve.susds_usdt", "sUSDS / USDT"),
      investment("amm.curve.pyusd_usds", "PYUSD / USDS"),
    ],
  ],
  maple,
  [
    "other_reviewed_vaults",
    "Other reviewed income",
    [
      investment("ethena.susde", "Ethena sUSDe"),
      investment("fluid.eth_usds", "Fluid USDS (Ethereum)"),
      investment("fluid.base_usds", "Fluid USDS (Base)"),
      investment("fluid.arbitrum_usds", "Fluid USDS (Arbitrum)"),
    ],
  ],
];
const grove: Family[] = [
  [
    "aave_v3",
    "Aave v3",
    [
      investment("aave.horizon_rlusd", "Horizon RLUSD"),
      investment("aave.horizon_usdc", "Horizon USDC"),
      investment("aave.eth_rlusd", "Ethereum RLUSD"),
    ],
  ],
  [
    "morpho_vaults",
    "Morpho vaults",
    [
      investment("morpho.grove_usdc", "Grove x Steakhouse USDC"),
      investment("morpho.grove_usdc_high_yield", "USDC High Yield (Ethereum)"),
      investment("morpho.grove_ausd", "Grove x Steakhouse AUSD"),
      investment("morpho.grove_base_usdc_high_yield", "USDC High Yield (Base)"),
      investment(
        "morpho.grove_base_prime_usdc",
        "Steakhouse Prime Instant (Base)",
      ),
      investment("morpho.grove_pyusd", "Steakhouse High Yield PYUSD"),
      investment("morpho.grove_monad_ausd", "AUSD High Yield (Monad)"),
    ],
  ],
  [
    "rwa_funds",
    "RWA vaults",
    [
      investment("rwa.stac", "STAC"),
      investment("rwa.jaaa", "JAAA (Ethereum)"),
      investment("rwa.jaaa_avalanche", "JAAA (Avalanche)"),
      investment("rwa.jtrsy", "JTRSY"),
      investment("rwa.buidl", "BUIDL"),
      investment("offchain.gaclo", "Galaxy Arch CLO (GACLO)"),
      investment("rwa.acrdx", "Apollo Diversified Credit (ACRDX)"),
    ],
  ],
  ["maple", "Maple", [investment("maple_syrup_usdc", "syrupUSDC")]],
];
const catalogs: Partial<Record<Prime, Family[]>> = {
  spark,
  grove,
  obex: [["maple", "Maple", [investment("maple_syrup_usdc", "syrupUSDC")]]],
  osero: [["sparklend", "SparkLend", [market("usds", "USDS")]]],
};

// Catalog membership comes from reviewed venue identities and settlement records.
// A catalog entry reserves a place in the statement, never an amount or loan term.
export function sheetStatementLines(
  prime: Prime | null,
  scope: Scope,
  report?: FinancialStatement | null,
): StatementLine[] {
  const rows: StatementLine[] = [];
  const used = new Set<string>();
  const definitions = new Map(
    (scope === "individual" ? report?.lines || [] : []).map((r) => [r.id, r]),
  );
  function add(
    id: string,
    label: string,
    parent?: string,
    kind?: StatementLine["kind"],
    sources?: string[],
  ) {
    if (used.has(id)) return;
    rows.push({
      id,
      label,
      parent,
      kind,
      level: 0,
      ...(sources ? { sources } : {}),
    });
    used.add(id);
  }
  const consumed = new Set<string>();
  function consume(id: string) {
    if (consumed.has(id)) return;
    consumed.add(id);
    for (const component of definitions.get(id)?.components || [])
      consume(component.id);
  }
  function member([id, label]: Member, parent: string) {
    add(id, label, parent);
    consume(id);
    // Preserve the old/new Morpho USDT vault audit detail below one business row.
    if (prime === "spark" && id === "investment.morpho.blue_chip_usdt")
      for (const c of definitions.get(id)?.components || []) {
        const d = definitions.get(c.id);
        if (d)
          add(
            c.id,
            c.id.endsWith("S11") ? "Previous deployment" : "Current deployment",
            id,
          );
      }
  }
  add("revenue", "Revenue", undefined, "section");
  add("demand", "Demand-side revenue");
  add("dr", "DR (Distribution Rewards)", "demand");
  add("ar", "AR (Agent rate)", "demand");
  if (prime === "skybase")
    add("gar", "GAR (Governance Accessibility Rewards)", "demand");
  if (prime === "grove" || definitions.has("demand.chronicle_points"))
    add("demand.chronicle_points", "Chronicle points", "demand");
  add("protocol", prime === "spark" ? "SparkLend fees" : "Protocol fees");
  add("curator", "Curator fees");
  const feePolicy =
    prime === "spark" &&
    sparkIncomePolicies.includes(report?.policy_version || "");
  const curatorLabels: Record<string, string> = {
    S10: "Blue Chip USDC",
    S11: "Blue Chip USDT (previous vault)",
    S65: "Blue Chip USDT (current vault)",
    S12: "Spark DAI",
    S13: "Spark USDS",
    S34: "USDC (Base)",
  };
  for (const d of definitions.values()) {
    if (
      feePolicy &&
      (d.id.startsWith("rewards.lending.sparklend.") ||
        d.id.startsWith("fees.sparklend."))
    ) {
      add(d.id, `${d.id.split(".").at(-1)!.toUpperCase()} reserve`, "protocol");
      consume(d.id);
    } else if (feePolicy && d.id.startsWith("fees.curator."))
      add(d.id, curatorLabels[d.id.split(".").at(-1)!] || d.label, "curator");
  }
  add("rewards", "Other incentives and rewards received");
  const linked = allocationRewardsPolicies.includes(
    report?.policy_version || "",
  );
  const general = [...definitions.values()].filter(
    (d) =>
      d.id.startsWith("rewards.") &&
      d.aggregation === "leaf" &&
      !consumed.has(d.id) &&
      !(linked && /rewards\.(lending|issuer)\./.test(d.id)),
  );
  for (const d of general) add(d.id, d.label, "rewards");
  add("gains", "Gains (losses) on non-stable assets, net");
  if (prime === "spark")
    for (const [id, label] of [
      ["morpho", "MORPHO"],
      ["avax", "AVAX"],
      ["eth_weth", "ETH / WETH"],
      ["sparklend_nonstable", "SparkLend non-USD reserves"],
    ])
      add(`gains.${id}`, label, "gains");
  for (const d of definitions.values())
    if (d.id.startsWith("gains.") && d.aggregation === "leaf")
      add(d.id, d.label, "gains");
  add("noninterest-income", "Noninterest revenue", undefined, "subtotal");
  add("interest", "Allocation revenue");
  if (scope === "individual") {
    const addFamily = ([key, label, members]: Family) => {
      const group = `statement.family.${key}`;
      add(group, label, "interest");
      for (const m of members) member(m, group);
    };
    for (const family of catalogs[prime!] || []) {
      if (prime !== "spark" || family[0] !== "other_reviewed_vaults")
        addFamily(family);
    }
    if (prime === "spark") {
      member(investment("arkis.usdc", "Arkis Spark Prime USDC 1"), "interest");
      add("allocation.anchorage", "Anchorage", "interest");
      // The sheet's principal amounts/maturity dates are proposed labels, not confirmed terms.
      for (let i = 1; i <= 3; i++)
        add(
          `allocation.anchorage.loan${i}`,
          `Loan ${i} · terms pending`,
          "allocation.anchorage",
        );
      member(["rewards.issuer.pyusd", "PYUSD"], "interest");
      member(["rewards.issuer.rlusd", "RLUSD"], "interest");
      member(investment("susds", "sUSDS"), "interest");
      member(["rewards.issuer.usdg", "USDG"], "interest");
      addFamily(spark.find((f) => f[0] === "other_reviewed_vaults")!);
    }
    if (prime === "grove") {
      member(investment("offchain.warehouse", "Galaxy Warehouse"), "interest");
      member(["rewards.issuer.agora", "Agora AUSD"], "interest");
      member(["rewards.issuer.usdg", "USDG"], "interest");
      member(investment("susds", "sUSDS"), "interest");
    }
    // Retain additional API members. Never add the same underlying venue below
    // both its business subtotal and a second generated family.
    for (const d of definitions.values()) {
      if (consumed.has(d.id) || d.aggregation === "subtotal") continue;
      const reward = linked && /rewards\.(lending|issuer)\./.test(d.id);
      if (!d.id.startsWith("investment.") && !reward) continue;
      if (
        d.aggregation !== "leaf" &&
        !(prime === "obex" && d.id === "investment.maple_syrup_usdc")
      )
        continue;
      const key = reward
        ? "allocation_rewards"
        : (d.family || "Other allocations").toLowerCase().replaceAll(" ", "_");
      const group = `statement.family.${key}`;
      add(
        group,
        reward
          ? "Allocation-linked incentives and rewards"
          : d.family === "RWA funds"
            ? "RWA vaults"
            : d.family || "Other allocations",
        "interest",
      );
      member(
        [
          d.id,
          d.label.replace(
            /\s+(net vault income|supply yield|supply revenue)$/,
            "",
          ),
        ],
        group,
      );
    }
    // Derived display groups use disjoint published income metrics. Missing
    // catalog members remain missing, including in each group's coverage.
    for (const r of rows.filter((r) => r.parent === "interest")) {
      const children = rows.filter((c) => c.parent === r.id);
      if (children.length) r.sources = children.map((c) => c.id);
    }
  }
  add("interest-expense", "Cost of capital");
  add("sky-funding", "Base rate", "interest-expense");
  if (prime === "spark") {
    const sources = ["usdc", "usdt", "eth", "pyusd", "usdg"].map(
      (s) => `funding.savings.${s}`,
    );
    add(
      "funding.savings",
      "Savings vaults",
      "interest-expense",
      undefined,
      sources,
    );
    for (const id of sources)
      add(
        id,
        `Savings ${id.split(".").at(-1)!.toUpperCase()}`,
        "funding.savings",
      );
  }
  add("net-interest", "Net interest income", undefined, "subtotal");
  add("net-revenue", "Total net revenue", undefined, "subtotal");
  add("expenses", "Expenses", undefined, "section");
  add("operating", "Operating expenses");
  for (const [id, label] of [
    ["engineering", "Engineering"],
    ["legal", "Legal"],
    ["security", "Audits and security"],
    ["other-operating", "Other operating expenses"],
  ])
    add(id, label, "operating");
  add("other-expenses", "Other expenses");
  if (prime === "spark")
    add("licence", "Aave profit share (SparkLend licence)", "other-expenses");
  add("incentives", "Incentives expense");
  add(
    "own-token",
    prime === "spark" ? "Own-token incentives (SPK)" : "Own-token incentives",
    "incentives",
  );
  add("stablecoin", "Stablecoin incentives", "incentives");
  add("distribution", "Distribution costs");
  add(
    "noninterest-expense",
    "Total noninterest expense",
    undefined,
    "subtotal",
  );
  if (scope !== "individual")
    add("eliminations", "Consolidation and elimination adjustments");
  add("net-income", "Net income", undefined, "total");
  // Render preorder, regardless of when extra API rows were discovered.
  const ordered: StatementLine[] = [];
  function visit(r: StatementLine, depth: number) {
    ordered.push({ ...r, level: depth });
    for (const child of rows.filter((c) => c.parent === r.id))
      visit(child, depth + 1);
  }
  for (const r of rows.filter((r) => !r.parent)) visit(r, r.kind ? 0 : 1);
  return ordered;
}

export function visibleStatementLines(
  rows: StatementLine[],
  collapsed: Set<string>,
) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return rows.filter((row) => {
    const seen = new Set([row.id]);
    let parent = row.parent;
    while (parent) {
      if (seen.has(parent)) return false;
      seen.add(parent);
      if (collapsed.has(parent)) return false;
      parent = byId.get(parent)?.parent;
    }
    return true;
  });
}

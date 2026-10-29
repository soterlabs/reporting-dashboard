import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  financialLine,
  financialPortfolioRows,
  positionAccruedIncome,
  validatePortfolio,
  validateStatement,
  type FinancialStatement,
  type FinancialPortfolio,
} from "./financial.ts";
import { statementLines, yearMonths } from "./prime-reports.ts";
import { statementCsvRows } from "./financial-export.ts";
import type { Venue } from "./reporting.ts";
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/financial-statement.json", import.meta.url),
    "utf8",
  ),
);
const portfolio = JSON.parse(
  readFileSync(
    new URL("./fixtures/financial-portfolio.json", import.meta.url),
    "utf8",
  ),
);
function statement(prime = "spark") {
  const doc = structuredClone(fixture);
  doc.policy_version = "prime-management.allocations.v2";
  doc.prime = prime;
  const definitions = [
    [
      "investment.sparklend.usds",
      "SparkLend USDS supply yield",
      "SparkLend",
      "leaf",
    ],
    [
      "investment.morpho.blue_chip_usdt",
      "Morpho USDT net vault income",
      "Morpho vaults",
      "leaf",
    ],
    [
      "investment.reviewed_income",
      "Reviewed native investment income subtotal",
      "Reviewed components",
      "subtotal",
    ],
    [
      "rewards.lending.sparklend.usds",
      "SparkLend external rewards received",
      "Received lending rewards",
      "leaf",
    ],
    [
      "rewards.issuer.pyusd",
      "PYUSD issuer incentive accrual",
      "Issuer compensation",
      "leaf",
    ],
  ];
  for (const [id, label, family, aggregation] of definitions)
    doc.lines.push({
      ...structuredClone(doc.lines[4]),
      id,
      label,
      family,
      aggregation,
    });
  return validateStatement(doc, prime as FinancialStatement["prime"], 2026);
}
test("v2 maps existing Spark leaves once, adds typed rewards and preserves unsupported parents", () => {
  const doc = statement();
  const rows = statementLines("spark", "individual", doc);
  assert.equal(
    rows.filter((r) => r.id === "investment.sparklend.usds").length,
    1,
  );
  assert.equal(
    rows.filter((r) => r.id === "investment.morpho.blue_chip_usdt").length,
    1,
  );
  assert.equal(rows.filter((r) => r.id === "rewards.issuer.pyusd").length, 1);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  for (const row of rows)
    if (row.parent)
      assert.ok(
        rows.some((r) => r.id === row.parent),
        row.id,
      );
  assert.equal(
    financialLine(doc, "investment.sparklend.usds")?.values["2026-10"].value,
    "100",
  );
  assert.equal(financialLine(doc, "interest"), undefined);
  assert.equal(rows.some((row) => row.id === "investment.reviewed_income"), false);
  const csv = statementCsvRows(
    "spark",
    "individual",
    2026,
    "2026-10",
    yearMonths(2026),
    doc,
  );
  assert.equal(csv.filter((r) => r[2] === "USDS market").length, 1);
  assert.equal(csv.find((r) => r[2] === "USDS market")?.[12], "100");
  assert.equal(
    statementLines("spark", "group", doc).some(
      (r) => r.id === "investment.sparklend.usds",
    ),
    false,
  );
});
test("other primes get their own family rows without inheriting Spark reserve templates", () => {
  const doc = statement("osero");
  const rows = statementLines("osero", "individual", doc);
  assert.ok(rows.some((r) => r.id === "investment.sparklend.usds"));
  assert.ok(!rows.some((r) => r.id.startsWith("allocation-")));
  assert.equal(
    statementLines("obex", "individual", fixture).find(
      (r) => r.id === "obex-maple",
    )?.label,
    "Maple syrupUSDC — net investment income",
  );
});
test("approved financial members render and export even when a legacy source has no v2 venue view", () => {
  const p = structuredClone(portfolio) as FinancialPortfolio;
  p.prime = "spark";
  p.policy_version = "prime-management.allocations.v2";
  p.portfolio.positions[0].source_venue_id = "S1";
  p.portfolio.positions[0].position_id = "spark.S1";
  const validated = validatePortfolio(p, "spark", "2026-10");
  const rows = financialPortfolioRows("spark", [], validated);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].revision, p.source.revision_id);
  assert.equal(rows[0].venue.position_value_usd, "1100");
  assert.equal(positionAccruedIncome(p, rows[0].venue), "100");
  assert.equal(financialPortfolioRows("spark", rows, validated), rows);
  assert.deepEqual(financialPortfolioRows("spark", [], null), []);
});
test("issuer claims never become interest receivables or allocation assets, and USDG receipts are not labelled accrual", () => {
  const p = structuredClone(portfolio) as FinancialPortfolio;
  p.prime = "spark";
  p.policy_version = "prime-management.allocations.v2";
  const m = structuredClone(p.portfolio.positions[0].income);
  p.claims = [
    {
      source_venue_id: "S69",
      label: "USDG issuer receipts",
      income: { ...m, recognition: "receipt" },
      cash_received: { ...m, recognition: "receipt" },
      receivable: { ...m, recognition: "valuation", value: "0" },
      received_in_advance: { ...m, recognition: "valuation", value: "0" },
      included_in_allocation_value: false,
    },
  ];
  const venue = { venue_id: "S69", method: "existing" } as Venue;
  assert.equal(
    positionAccruedIncome(validatePortfolio(p, "spark", "2026-10"), venue),
    null,
  );
  p.claims[0].source_venue_id = "S68";
  p.claims[0].income.recognition = "accrual";
  assert.equal(positionAccruedIncome(p, { ...venue, venue_id: "S68" }), "100");
  assert.ok(
    !financialPortfolioRows("spark", [], p).some(
      (r) => r.venue.venue_id === "S68",
    ),
  );
});

test("v2.1 accepts the corrected policy while retaining v2 statement bindings", () => {
  const original = statement();
  const corrected = structuredClone(original);
  corrected.policy_version = "prime-management.allocations.v2.1";
  const validated = validateStatement(corrected, "spark", 2026);
  assert.deepEqual(
    statementLines("spark", "individual", validated),
    statementLines("spark", "individual", original),
  );
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Decimal from "decimal.js";
import {
  statementLines,
  collapsedStatementGroups,
  yearMonths,
} from "./prime-reports.ts";
import { visibleStatementLines } from "./statement-layout.ts";
import {
  statementFinancialLine,
  statementRowUncertainty,
} from "./statement-values.ts";
import { statementCsvRows } from "./financial-export.ts";
import { metricAmount, type FinancialStatement } from "./financial.ts";
import { PRIMES } from "./reporting.ts";
const fixture = (file: string): FinancialStatement =>
  JSON.parse(
    readFileSync(new URL(`./fixtures/${file}`, import.meta.url), "utf8"),
  );

test("every prime has a stable tree, ordered parents and matching indentation with or without API data", () => {
  for (const prime of PRIMES) {
    const report = fixture(
      prime === "spark"
        ? "spark-fees-statement.json"
        : prime === "grove"
          ? "grove-archive-statement.json"
          : "rollup-statement.json",
    );
    report.prime = prime;
    for (const doc of [undefined, report]) {
      const rows = statementLines(prime, "individual", doc);
      assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
      for (const [i, r] of rows.entries())
        if (r.parent) {
          const p = rows.findIndex((p) => p.id === r.parent);
          assert.ok(p >= 0 && p < i, r.id);
          assert.equal(r.level, rows[p].level + 1, r.id);
        }
      assert.equal(
        rows.some((r) => r.id === "gar"),
        prime === "skybase",
      );
      assert.ok(
        rows.some(
          (r) => r.id === "interest" && r.label === "Allocation revenue",
        ),
      );
      const collapsed = collapsedStatementGroups(rows);
      const visible = visibleStatementLines(rows, collapsed);
      assert.ok(visible.some((r) => r.id === "net-income"));
      assert.ok(visible.every((r) => !r.parent));
    }
  }
});

test("Spark sheet members stay present and native business returns do not duplicate venue leaves", () => {
  const report = fixture("spark-fees-statement.json");
  const before = JSON.stringify(report);
  const rows = statementLines("spark", "individual", report);
  for (const label of [
    "SparkLend fees",
    "WETH market",
    "Sentora RLUSD",
    "Savings vaults",
    "Savings ETH",
    "sUSDS",
    "Anchorage",
    "Other reviewed income",
  ])
    assert.ok(
      rows.some((r) => r.label === label),
      label,
    );
  assert.equal(
    rows.filter((r) => r.id.startsWith("investment.venue.")).length,
    2,
  ); // optional old/new USDT detail only
  const usdt = rows.find((r) => r.id === "investment.morpho.blue_chip_usdt")!;
  assert.deepEqual(
    rows.filter((r) => r.parent === usdt.id).map((r) => r.id),
    ["investment.venue.S11", "investment.venue.S65"],
  );
  for (const program of ["pyusd", "rlusd", "usdg"]) {
    const r = rows.filter((r) => r.id === `rewards.issuer.${program}`);
    assert.equal(r.length, 1);
    assert.equal(r[0].parent, "interest");
  }
  const other = rows.find(
    (r) => r.id === "statement.family.allocation_rewards",
  )!;
  assert.ok(other.sources!.every((id) => !id.startsWith("rewards.issuer.")));
  const expected = other.sources!.reduce(
    (s, id) =>
      s.plus(
        metricAmount(
          report.lines.find((r) => r.id === id)?.values["2026-10"],
        ) || "0",
      ),
    new Decimal(0),
  );
  assert.equal(
    metricAmount(statementFinancialLine(report, other)?.values["2026-10"]),
    expected.toString(),
  );
  assert.equal(JSON.stringify(report), before);
});

test("Grove RWA vaults include GACLO once, preserve published income and show unsupported members as missing", () => {
  const report = fixture("grove-archive-statement.json");
  const rows = statementLines("grove", "individual", report);
  const group = rows.find((r) => r.id === "statement.family.rwa_funds")!;
  assert.equal(group.label, "RWA vaults");
  for (const id of [
    "investment.rwa.stac",
    "investment.rwa.jaaa",
    "investment.offchain.gaclo",
    "investment.rwa.jaaa_avalanche",
    "investment.rwa.acrdx",
    "investment.rwa.jtrsy",
    "investment.rwa.buidl",
  ]) {
    const r = rows.filter((r) => r.id === id);
    assert.equal(r.length, 1);
    assert.equal(r[0].parent, group.id);
  }
  const cell = statementFinancialLine(report, group)!.values["2026-01"];
  const expected = [
    "investment.rwa.stac",
    "investment.rwa.jaaa",
    "investment.offchain.gaclo",
  ].reduce(
    (s, id) =>
      s.plus(
        metricAmount(
          report.lines.find((r) => r.id === id)!.values["2026-01"],
        ) || "0",
      ),
    new Decimal(0),
  );
  assert.equal(cell.status, "partial");
  assert.equal(cell.value, null);
  assert.equal(cell.known_value, expected.toString());
  assert.ok(cell.missing_components!.includes("investment.rwa.jtrsy"));
  const wh = rows.find((r) => r.id === "investment.offchain.warehouse")!;
  assert.match(statementRowUncertainty(report, wh, "2026-07")!, /servicing/);
});

test("view sums preserve signed precision, never zero-fill absent components and keep future months empty", () => {
  const report = fixture("rollup-statement.json");
  const metric = report.lines.find(
    (r) => r.id === "investment.maple_syrup_usdc",
  )!;
  metric.values["2026-10"].value = "-0.12345678901234567890123456789";
  const row = {
    id: "view",
    label: "View",
    level: 2,
    sources: [metric.id, metric.id, "not-published"],
  };
  const cell = statementFinancialLine(report, row)!.values["2026-10"];
  assert.equal(cell.known_value, "-0.12345678901234567890123456789");
  assert.equal(cell.status, "partial");
  assert.equal(
    statementFinancialLine(report, row)!.values["2026-12"].status,
    "future",
  );
  assert.equal(
    statementFinancialLine(report, { ...row, sources: ["not-published"] })!
      .values["2026-10"].known_value,
    null,
  );
});

test("CSV exports the same view subtotals and explicit parent/depth and derivation metadata", () => {
  const report = fixture("grove-archive-statement.json");
  const csv = statementCsvRows(
    "grove",
    "individual",
    2026,
    "2026-01",
    yearMonths(2026),
    report,
  );
  const col = (s: string) => csv[0].indexOf(s);
  const group = csv.find((r) => r[2] === "RWA vaults")!;
  const child = csv.find((r) => r[2] === "Galaxy Arch CLO (GACLO)")!;
  assert.equal(child[col("Parent row ID")], "statement.family.rwa_funds");
  assert.equal(child[col("Depth")], 3);
  assert.match(group[col("Subtotal derivation")] as string, /Dashboard sum/);
  assert.equal(
    group[col("Monthly coverage")] &&
      JSON.parse(group[col("Monthly coverage")] as string)["2026-01"],
    "partial",
  );
  assert.ok(csv.every((r) => r.length === csv[0].length));
});

test("regrouped sums cannot certify a child with an unclassified or existing income basis", () => {
  const report = fixture("rollup-statement.json");
  report.source_lag_periods = [];
  for (const p of report.periods) p.stale = false;
  const source = report.lines.find(
    (r) => r.id === "investment.maple_syrup_usdc",
  )!;
  const row = { id: "view", label: "View", level: 2, sources: [source.id] };
  source.values["2026-10"].basis = "existing";
  source.values["2026-10"].recognition = "accrual";
  assert.equal(
    statementFinancialLine(report, row)!.values["2026-10"].status,
    "available",
  );
  assert.match(statementRowUncertainty(report, row, "2026-10")!, /uncertain/);
});

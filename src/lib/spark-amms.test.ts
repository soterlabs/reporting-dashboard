import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateStatement, metricAmount, sparkAmmIds } from "./financial.ts";
import { statementLines, yearMonths } from "./prime-reports.ts";
import { statementFinancialLine } from "./statement-values.ts";
import { statementCsvRows } from "./financial-export.ts";
import { sparkIncomePolicy } from "./financial-policies.ts";
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/spark-amms-statement.json", import.meta.url),
    "utf8",
  ),
);

test("Spark AMM monthly sources validate and render five distinct pools with their own subtotals", () => {
  const r = validateStatement(structuredClone(fixture), "spark", 2026);
  const rows = statementLines("spark", "individual", r);
  for (const id of sparkAmmIds) {
    const found = rows.filter((row) => row.id === id);
    assert.equal(found.length, 1);
    assert.equal(
      found[0].parent,
      id.includes("uniswap_v4")
        ? "statement.family.uniswap_v4"
        : "statement.family.curve",
    );
  }
  const uni = rows.find((row) => row.id === "statement.family.uniswap_v4")!;
  assert.equal(
    metricAmount(statementFinancialLine(r, uni)!.values["2026-09"]),
    "312",
  );
  assert.equal(
    statementFinancialLine(r, uni)!.values["2026-09"].status,
    "partial",
  );
  assert.equal(
    rows.find((row) => row.id === "rewards.issuer.rlusd")!.parent,
    "interest",
  );
  assert.equal(
    rows.find((row) => row.id === "rewards.lending.sparklend.usds")!.parent,
    "protocol",
  );
  const curve = r.lines.find(
    (row) => row.id === "investment.amm.curve.susds_usdt",
  )!;
  assert.equal(curve.values["2026-01"].value, "25473.95");
  assert.equal(
    curve.values["2026-01"].allocation_split!.sky_share_excluded_income_usd,
    "25473.95",
  );
  assert.equal(curve.values["2026-01"].quality, "estimate");
});

test("AMM monthly source authority cannot leak into old policies, other rows or mismatched Sky splits", () => {
  for (const mutate of [
    (r: typeof fixture) => {
      r.policy_version = sparkIncomePolicy;
    },
    (r: typeof fixture) => {
      r.lines.find((x: { id: string }) => x.id === sparkAmmIds[0]).id =
        "investment.amm.uniswap_v4.unknown";
    },
    (r: typeof fixture) => {
      r.lines.find((x: { id: string }) => x.id === sparkAmmIds[0]).values[
        "2026-09"
      ].allocation_split.prime_income_usd = "999";
    },
    (r: typeof fixture) => {
      r.lines.find((x: { id: string }) => x.id === sparkAmmIds[3]).values[
        "2026-01"
      ].allocation_split.sky_share_excluded_income_usd = "123";
    },
  ]) {
    const r = structuredClone(fixture);
    mutate(r);
    assert.throws(() => validateStatement(r, "spark", 2026));
  }
});

test("AMM CSV contains return amounts and partial coverage, never pool principal", () => {
  const r = validateStatement(fixture, "spark", 2026);
  const csv = statementCsvRows(
    "spark",
    "individual",
    2026,
    "2026-09",
    yearMonths(2026),
    r,
  );
  const id = csv[0].indexOf("Row ID");
  const row = csv.find((x) => x[id] === sparkAmmIds[0])!;
  assert.equal(row[11], "402.03");
  assert.equal(
    JSON.parse(row[csv[0].indexOf("Monthly coverage")] as string)["2026-09"],
    "partial",
  );
  assert.notEqual(row[11], "100119291.45");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateStatement, financialLine } from "./financial.ts";
import {
  statementLines,
  yearMonths,
  collapsedStatementGroups,
} from "./prime-reports.ts";
import { statementCsvRows } from "./financial-export.ts";

// Backend-generated contract fixture: published Jan–Sep summaries plus the
// exact financial/raw-source pair retained at 2026-10-27.
const input = JSON.parse(
  readFileSync(
    new URL("./fixtures/grove-rwa-statement.json", import.meta.url),
    "utf8",
  ),
);

test("both RWA income rows contain real values for every month from January through October MTD", () => {
  const report = validateStatement(input, "grove", 2026);
  const rows = statementLines("grove", "individual", report);
  assert.equal(report.periods[9].actual_cutoff, "2026-10-27");
  for (const id of ["investment.rwa.stac", "investment.rwa.jaaa"]) {
    assert.equal(rows.filter((row) => row.id === id).length, 1);
    const row = financialLine(report, id)!;
    for (let month = 1; month <= 10; month++) {
      const key = `2026-${String(month).padStart(2, "0")}`;
      assert.equal(row.values[key].status, "available");
      assert.notEqual(row.values[key].value, null);
      assert.equal(row.values[key].recognition, "investment_return");
    }
    assert.equal(row.total.status, "available");
  }
  assert.equal(
    financialLine(report, "investment.rwa.jaaa")!.values["2026-03"].value,
    "0.00",
  );
  assert.equal(
    financialLine(report, "statement.family.rwa_funds")!.total.value,
    "8373337.4646168581493691352",
  );
  assert.equal(
    financialLine(report, "interest")!.values["2026-10"].known_value,
    "1109542.5120614898257495338262500",
  );
  assert.ok(collapsedStatementGroups(rows).has("statement.family.rwa_funds"));
  assert.equal(
    rows.find((row) => row.id === "interest")!.label,
    "Investment income from allocations",
  );
  assert.equal(
    rows.find((row) => row.id === "net-interest")!.label,
    "Net investment income after funding",
  );
});

test("the same CSV contains numeric history and YTD for the two venues without inventing complete entity totals", () => {
  const report = validateStatement(input, "grove", 2026);
  const rows = statementCsvRows(
    "grove",
    "individual",
    2026,
    "2026-10",
    yearMonths(2026),
    report,
  );
  for (const id of ["investment.rwa.stac", "investment.rwa.jaaa"]) {
    const metric = financialLine(report, id)!;
    const exported = rows.find((row) => row[2] === metric.label)!;
    for (let month = 1; month <= 10; month++) {
      assert.equal(
        exported[month + 2],
        metric.values[`2026-${String(month).padStart(2, "0")}`].value,
      );
    }
    assert.equal(exported[15], metric.total.value);
  }
  const investment = rows.find(
    (row) => row[2] === "Investment income from allocations",
  )!;
  assert.equal(investment[15], "Partial");
  assert.ok(rows.every((row) => row.length === rows[0].length));
});

test("monthly RWA source authority is restricted to Grove and the reviewed new policy", () => {
  const bad = structuredClone(input);
  bad.policy_version = "prime-management.statement-rollups.v3.1";
  assert.throws(() => validateStatement(bad, "grove", 2026));
  const missing = structuredClone(input);
  const row = missing.lines.find(
    (row: { id: string }) => row.id === "investment.rwa.stac",
  );
  row.values["2026-01"].source_ref = missing.periods[1].monthly_revision;
  assert.throws(() => validateStatement(missing, "grove", 2026));
});

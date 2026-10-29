import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateStatement,
  financialLine,
  metricExplanation,
  type FinancialStatement,
} from "./financial.ts";
import {
  statementLines,
  collapsedStatementGroups,
  individualReportHref,
  SCOPES,
  yearMonths,
} from "./prime-reports.ts";
import { statementCsvRows } from "./financial-export.ts";

const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/rollup-statement.json", import.meta.url),
    "utf8",
  ),
);

test("rollups bind complete reviewed families and explicitly partial parent/YTD amounts", () => {
  const report = validateStatement(fixture, "obex", 2026);
  const interest = financialLine(report, "interest")!;
  assert.equal(interest.values["2026-10"].value, null);
  assert.equal(interest.values["2026-10"].known_value, "100");
  assert.equal(interest.values["2026-10"].status, "partial");
  assert.match(
    metricExplanation(interest.values["2026-10"]),
    /not a complete total/,
  );
  assert.equal(
    financialLine(report, "net-interest")!.values["2026-10"].known_value,
    "0",
  );
  assert.equal(
    financialLine(report, "statement.family.maple")!.values["2026-10"].value,
    "100",
  );
  assert.match(
    metricExplanation(financialLine(report, "net-income")!.values["2026-10"]),
    /income tax/,
  );
  const rows = statementLines("obex", "individual", report);
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  for (const row of rows)
    if (row.parent) assert.ok(rows.some((parent) => parent.id === row.parent));
  assert.equal(
    rows.filter((r) => r.id === "investment.maple_syrup_usdc").length,
    1,
  );
});

test("every expandable group starts collapsed, including API-created families", () => {
  const report = validateStatement(fixture, "obex", 2026);
  const rows = statementLines("obex", "individual", report);
  const collapsed = collapsedStatementGroups(rows);
  for (const row of rows) if (row.parent) assert.ok(collapsed.has(row.parent));
  assert.ok(collapsed.has("interest"));
  assert.ok(collapsed.has("statement.family.maple"));
  assert.ok(collapsed.has("demand"));
});

test("UI and CSV remove requested lines and keep partial numbers separate from full totals", () => {
  const report = validateStatement(fixture, "obex", 2026);
  const csv = statementCsvRows(
    "obex",
    "individual",
    2026,
    "2026-10",
    yearMonths(2026),
    report,
  );
  for (const label of [
    "Income before tax",
    "Income tax expense",
    "Credit impairment expense",
    "Before spread reimbursement",
    "Spread reimbursement (deduction)",
  ])
    assert.equal(
      csv.some((row) => row[2] === label),
      false,
    );
  const interest = csv.find(
    (r) => r[2] === "Interest income from allocations",
  )!;
  const column = (label: string) => csv[0].indexOf(label);
  assert.equal(interest[12], "Partial");
  assert.equal(
    JSON.parse(interest[column("Monthly known components USD")] as string)[
      "2026-10"
    ],
    "100",
  );
  assert.equal(interest[column("Total coverage")], "partial");
  assert.equal(interest[column("Total known components USD")], "200");
  assert.ok(csv.every((row) => row.length === csv[0].length));
});

test("only individual scope is offered and retired links preserve prime/year/view/month", () => {
  assert.deepEqual(
    SCOPES.map((scope) => scope.key),
    ["individual"],
  );
  const target = new URL(
    individualReportHref("grove", {
      scope: "combined",
      year: "2026",
      view: "positions",
      month: "2026-08",
    }),
    "http://test",
  );
  assert.equal(target.pathname, "/primes/grove");
  assert.equal(target.searchParams.get("scope"), "individual");
  assert.equal(target.searchParams.get("year"), "2026");
  assert.equal(target.searchParams.get("view"), "positions");
  assert.equal(target.searchParams.get("month"), "2026-08");
});

test("derived amounts reject missing or cross-month provenance and duplicate components", () => {
  for (const mutate of [
    (v: FinancialStatement) => {
      const cell = financialLine(v, "ar")!.values["2026-10"];
      cell.known_value = cell.value;
      cell.value = null;
      cell.status = "partial";
      delete cell.source_ref;
    },
    (v: FinancialStatement) => {
      financialLine(v, "interest")!.values["2026-10"].source_refs = [];
    },
    (v: FinancialStatement) => {
      financialLine(v, "interest")!.values["2026-10"].source_refs = [
        v.periods[8].financial_revision!,
      ];
    },
    (v: FinancialStatement) => {
      const line = financialLine(v, "interest")!;
      line.components!.push(line.components![0]);
    },
  ]) {
    const bad = structuredClone(fixture);
    mutate(bad);
    assert.throws(() => validateStatement(bad, "obex", 2026));
  }
});

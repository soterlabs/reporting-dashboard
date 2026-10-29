import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  financialExportMetadata,
  FINANCIAL_EXPORT_HEADERS,
  portfolioSummaryCsv,
  statementCsvRows,
  positionCsvRow,
} from "./financial-export.ts";
import {
  statementMonths,
  statementTotalLabel,
  validatePortfolio,
  validateStatement,
  financialPortfolioRows,
} from "./financial.ts";
import { yearMonths } from "./prime-reports.ts";
const statement = validateStatement(
  JSON.parse(
    readFileSync(
      new URL("./fixtures/financial-statement.json", import.meta.url),
      "utf8",
    ),
  ),
  "obex",
  2026,
);
const portfolio = validatePortfolio(
  JSON.parse(
    readFileSync(
      new URL("./fixtures/financial-portfolio.json", import.meta.url),
      "utf8",
    ),
  ),
  "obex",
  "2026-10",
);

test("a retained October MTD statement keeps its labels and exact decimals after month and year rollover", () => {
  for (const now of ["2026-11-02T00:00:00Z", "2027-01-02T00:00:00Z"]) {
    const calendar = yearMonths(2026, new Date(now));
    const months = statementMonths(statement, calendar);
    assert.equal(months[9].state, "partial");
    assert.equal(months[10].state, "future");
    assert.equal(statementTotalLabel(statement, "FY 2026"), "YTD 2026");
    const rows = statementCsvRows(
      "obex",
      "individual",
      2026,
      "2026-10",
      calendar,
      statement,
    );
    assert.equal(rows[0][12], "Oct 2026 MTD");
    assert.equal(rows[0][13], "Nov 2026 future");
    assert.equal(rows[0][15], "YTD 2026");
    const ar = rows.find((r) => r[2] === "Agent rate (AR)")!;
    assert.equal(ar[12], "12.000000000000000001");
    assert.equal(ar[15], "TBD");
    assert.equal(ar[18], statement.report_hash);
    assert.equal(ar[19], statement.selection);
    assert.ok(rows.every((r) => r.length === rows[0].length));
  }
});

test("portfolio CSV distinguishes summary from position rows and retains partial coverage and provenance", () => {
  const read = {
    report: structuredClone(portfolio),
    retained: true,
    message: "Refresh failed",
  };
  read.report.portfolio.closing_value = {
    ...read.report.portfolio.closing_value,
    status: "partial",
    value: null,
    known_value: "1100",
    reason: "unreviewed_positions",
  };
  const row = portfolioSummaryCsv(
    "individual",
    "obex",
    "2026-10",
    read,
    Array(7).fill(null),
  );
  assert.equal(row.length, 23 + FINANCIAL_EXPORT_HEADERS.length);
  assert.equal(row[7], null);
  assert.equal(row[14], "partial");
  assert.equal(row[23], "portfolio_summary");
  assert.equal(row[24], portfolio.financial_revision);
  assert.equal(row[25], portfolio.report_hash);
  assert.equal(row[30], "Refresh failed; retained financial publication");
  assert.equal(row[32], "1100");
  const metadata = financialExportMetadata(
    read,
    "position",
    read.report.portfolio.positions[0].income,
  );
  assert.equal(metadata.length, FINANCIAL_EXPORT_HEADERS.length);
  assert.equal(metadata[0], "position");
  assert.equal(metadata[9], ""); // never repeat a known aggregate as a per-position amount
  const missing = portfolioSummaryCsv(
    "individual",
    "obex",
    "2026-10",
    null,
    Array(7).fill(null),
  );
  assert.equal(missing[7], undefined);
  assert.equal(missing[14], "unavailable");
});

test("v3-only member exports retain actual dates and disambiguate identical deployment labels", () => {
  const report = structuredClone(portfolio);
  report.prime = "spark";
  report.policy_version = "prime-management.allocations.v2.1";
  const original = report.portfolio.positions[0];
  report.portfolio.positions = ["S11", "S65"].map((id) => ({
    ...structuredClone(original),
    source_venue_id: id,
    position_id: `spark.${id}`,
    label: "Morpho Blue Chip USDT net vault income",
  }));
  const read = { report, retained: false, message: null };
  const members = financialPortfolioRows("spark", [], report);
  const exported = members.map((row) =>
    positionCsvRow("individual", "2026-10", row, read, Array(7).fill(null)),
  );
  const headers = [...Array(23).fill(""), ...FINANCIAL_EXPORT_HEADERS];
  assert.ok(exported.every((row) => row.length === headers.length));
  assert.ok(exported.every((row) => row[4] === report.cutoff));
  const venueColumn = headers.indexOf("Source venue ID"),
    positionColumn = headers.indexOf("Position ID");
  assert.deepEqual(
    exported.map((row) => row[venueColumn]),
    ["S11", "S65"],
  );
  assert.deepEqual(
    exported.map((row) => row[positionColumn]),
    ["spark.S11", "spark.S65"],
  );
  assert.ok(exported.every((row) => row[8] === original.income.value));
});

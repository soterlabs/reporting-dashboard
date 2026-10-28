import { test } from "node:test";
import assert from "node:assert/strict";
import {
  annualAmount,
  chooseMonth,
  reportingYear,
  statementLines,
  totalLabel,
  yearMonths,
  sourceCatalog,
} from "./prime-reports.ts";

test("annual periods distinguish month-end, partial and future; year-to-date never implies a full year", () => {
  const months = yearMonths(2026, new Date("2026-10-28T00:00:00Z"));
  assert.equal(months[8].cutoff, "2026-09-30");
  assert.equal(months[9].cutoff, "2026-10-27");
  assert.equal(months[9].state, "partial");
  assert.equal(months[10].cutoff, null);
  assert.equal(totalLabel(months), "YTD 2026");
  assert.equal(
    totalLabel(yearMonths(2025, new Date("2026-10-28T00:00:00Z"))),
    "FY 2025",
  );
  assert.equal(chooseMonth(months).key, "2026-10");
  assert.equal(chooseMonth(months, "2026-12").key, "2026-12");
});
test("YTD is unavailable if any elapsed month is missing; future months are not counted as zero forecasts", () => {
  const months = yearMonths(2026, new Date("2026-03-20T00:00:00Z"));
  assert.equal(
    annualAmount(["1.1", "2.2", "3.3", ...Array(9).fill(null)], months),
    "6.6",
  );
  assert.equal(
    annualAmount(["1.1", null, "3.3", ...Array(9).fill(null)], months),
    null,
  );
  assert.equal(annualAmount(Array(12).fill("0"), months), "0");
  assert.equal(
    annualAmount(
      Array(12).fill("1"),
      yearMonths(2026, new Date("2026-01-01T00:00:00Z")),
    ),
    null,
  );
});
test("year and month defaults stay in the selected year and respect completed UTC days", () => {
  assert.equal(reportingYear("2030", new Date("2026-10-28T00:00:00Z")), 2026);
  assert.equal(
    chooseMonth(yearMonths(2025, new Date("2026-10-28T00:00:00Z")), "2026-10")
      .key,
    "2025-12",
  );
  const months = yearMonths(2026, new Date("2026-11-01T00:00:00Z"));
  assert.equal(months[9].cutoff, "2026-10-31");
  assert.equal(months[9].state, "complete");
  assert.equal(months[10].state, "future");
});
test("statements contain unique hierarchical rows and separate pre-tax income, tax and net income", () => {
  for (const scope of ["individual", "group", "combined"] as const) {
    const rows = statementLines(scope === "combined" ? null : "spark", scope);
    const ids = new Set(rows.map((r) => r.id));
    assert.equal(ids.size, rows.length);
    for (const row of rows) if (row.parent) assert.ok(ids.has(row.parent));
    assert.ok(ids.has("pretax") && ids.has("tax") && ids.has("net-income"));
    assert.equal(ids.has("eliminations"), scope !== "individual");
  }
  assert.equal(
    statementLines("grove", "individual").some((r) => r.label === "SparkLend"),
    false,
  );
  assert.deepEqual(sourceCatalog([]), []);
});

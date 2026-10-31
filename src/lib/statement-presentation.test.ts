import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  allocationRewardsPolicy,
  financialLine,
  metricAmount,
  statementMonthNote,
  statementMonths,
  validateStatement,
  type Metric,
} from "./financial.ts";
import {
  collapsedStatementGroups,
  statementLines,
  yearMonths,
} from "./prime-reports.ts";
import { statementCsvRows } from "./financial-export.ts";

const input = JSON.parse(
  readFileSync(
    new URL(
      "./fixtures/grove-allocation-rewards-statement.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("available sums show numbers, losses and zeroes while unknown and future cells stay empty", () => {
  const template = input.lines[0].values["2026-10"] as Metric;
  for (const value of ["0", "-12.34567890123456789", "100"])
    assert.equal(
      metricAmount({
        ...template,
        status: "partial",
        value: null,
        known_value: value,
      }),
      value,
    );
  assert.equal(
    metricAmount({ ...template, status: "unavailable", value: null }),
    null,
  );
  assert.equal(
    metricAmount({
      ...template,
      status: "partial",
      value: null,
      known_value: null,
    }),
    null,
  );
  assert.equal(
    metricAmount({ ...template, status: "future", value: null }),
    null,
  );
  assert.equal(metricAmount(undefined), null);
});

test("month headers share the EOM convention and retain only the selected publication's MTD date", () => {
  const report = validateStatement(input, "grove", 2026);
  const months = statementMonths(
    report,
    yearMonths(2026, new Date("2027-01-05")),
  );
  assert.equal(statementMonthNote(months[0], report.periods[0]), null);
  assert.equal(
    statementMonthNote(months[9], report.periods[9]),
    "MTD · Oct 27",
  );
  assert.equal(statementMonthNote(months[10], report.periods[10]), null);
  assert.equal(statementMonthNote(months[9]), "MTD");
});

test("new policy puts allocation-linked rewards under allocation income exactly once and keeps both reward families collapsed", () => {
  const report = validateStatement(input, "grove", 2026);
  assert.equal(report.policy_version, allocationRewardsPolicy);
  const rows = statementLines("grove", "individual", report);
  const group = rows.find(
    (row) => row.id === "statement.family.allocation_rewards",
  )!;
  assert.equal(group.parent, "interest");
  assert.equal(group.structural, false);
  const rewards = report.lines.filter(
    (r) => r.aggregation === "leaf" && r.id.startsWith("rewards.lending."),
  );
  assert.ok(rewards.length > 0);
  for (const reward of rewards) {
    const matches = rows.filter((row) => row.id === reward.id);
    assert.equal(matches.length, 1);
    assert.equal(matches[0].parent, group.id);
    assert.ok(
      financialLine(report, "interest")!.components!.some(
        (c) => c.id === reward.id,
      ),
    );
    assert.ok(
      !financialLine(report, "rewards")!.components!.some(
        (c) => c.id === reward.id,
      ),
    );
  }
  assert.equal(
    rows.find((r) => r.id === "rewards")!.label,
    "Other incentives and rewards received",
  );
  assert.ok(collapsedStatementGroups(rows).has(group.id));
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
});

test("CSV uses the same exact available sums as the screen and keeps source coverage separately", () => {
  const report = validateStatement(input, "grove", 2026);
  const rows = statementCsvRows(
    "grove",
    "individual",
    2026,
    "2026-10",
    yearMonths(2026),
    report,
  );
  const cols = rows[0];
  const income = rows.find(
    (row) => row[2] === "Investment income from allocations",
  )!;
  assert.equal(
    income[12],
    metricAmount(financialLine(report, "interest")!.values["2026-10"]),
  );
  assert.equal(
    income[15],
    metricAmount(financialLine(report, "interest")!.total),
  );
  assert.equal(income[cols.indexOf("Total coverage")], "partial");
  assert.equal(income[13], "—");
  assert.equal(rows[0][13], "Nov 2026");
  assert.ok(
    rows.slice(1).every((row) => !row.slice(3, 16).includes("Partial")),
  );
  assert.ok(rows.every((row) => row.length === cols.length));
});

test("v3.3 keeps reviewed RWA source and ownership validation", () => {
  const bad = structuredClone(input);
  bad.lines.find((r: { id: string }) => r.id === "investment.rwa.stac").values[
    "2026-01"
  ].recognition = "receipt";
  assert.throws(() => validateStatement(bad, "grove", 2026));
});

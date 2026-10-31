import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateStatement,
  metricAmount,
  metricExplanation,
} from "./financial.ts";
import { statementLines, yearMonths } from "./prime-reports.ts";
import { statementCsvRows, offchainCsvRows } from "./financial-export.ts";

const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/grove-offchain-statement.json", import.meta.url),
    "utf8",
  ),
);

test("monthly Grove accruals validate and bind once to allocation income", () => {
  const r = validateStatement(structuredClone(fixture), "grove", 2026);
  const lines = statementLines("grove", "individual", r);
  for (const id of [
    "investment.offchain.gaclo",
    "investment.offchain.warehouse",
  ]) {
    assert.equal(lines.filter((l) => l.id === id).length, 1);
    assert.equal(
      lines.find((l) => l.id === id)?.parent,
      "statement.family.offchain_lending",
    );
  }
  const wh = r.lines.find((l) => l.id === "investment.offchain.warehouse")!;
  assert.equal(metricAmount(wh.values["2026-09"]), "1894876.53");
  assert.equal(wh.values["2026-10"].quality, "estimate");
  assert.match(
    metricExplanation(wh.values["2026-10"], r),
    /Estimate through 2026-10-25/,
  );
  assert.match(metricExplanation(wh.total, r), /Estimate included/);
  assert.equal(
    r.offchain_positions![0].values["2026-01"].metrics.closing_receivable
      .quality,
    "estimate",
  );
});

test("CSV keeps actual earning dates and estimates alongside numeric amounts", () => {
  const r = validateStatement(structuredClone(fixture), "grove", 2026);
  const csv = statementCsvRows(
    "grove",
    "individual",
    2026,
    "2026-10",
    yearMonths(2026),
    r,
  );
  const wh = csv.find((row) => row[2] === "Galaxy Warehouse")!;
  assert.equal(wh[12], "1716294.145833333");
  const meta = JSON.parse(
    wh[csv[0].indexOf("Monthly estimates and earning cutoffs")] as string,
  );
  assert.deepEqual(meta["2026-10"], {
    quality: "estimate",
    through: "2026-10-25",
  });
  assert.equal(wh[csv[0].indexOf("Total includes estimates")], "yes");
});

test("reject mismatched sources, positions, estimates, dates and duplicate schedules", () => {
  const changes = [
    (r: typeof fixture) => {
      r.offchain_positions[0].values["2026-01"].metrics.earned_income.value =
        "999";
    },
    (r: typeof fixture) => {
      r.offchain_positions[0].source_venue_id = "S1";
    },
    (r: typeof fixture) => {
      r.offchain_positions.push(r.offchain_positions[0]);
    },
    (r: typeof fixture) => {
      r.offchain_positions[0].values[
        "2026-01"
      ].metrics.cash_received.source_ref = "f".repeat(64);
    },
    (r: typeof fixture) => {
      r.lines.find(
        (l: { id: string }) => l.id === "investment.offchain.warehouse",
      ).values["2026-10"].quality = "final";
    },
    (r: typeof fixture) => {
      r.offchain_positions[1].values["2026-10"].period_end = "2026-10-31";
    },
  ];
  for (const change of changes) {
    const r = structuredClone(fixture);
    change(r);
    assert.throws(() => validateStatement(r, "grove", 2026));
  }
});

test("offchain CSV exports all thirteen periods without adding stock balances", () => {
  const r = validateStatement(structuredClone(fixture), "grove", 2026);
  const rows = offchainCsvRows(r);
  assert.equal(rows.length, 14);
  const wh = rows.find((row) => row[1] === "E42" && row[3] === "2026-10")!;
  assert.equal(wh[4], "2026-10-25");
  assert.equal(wh[rows[0].indexOf("earned_income USD")], "1716294.145833333");
  assert.equal(wh[rows[0].indexOf("fees USD")], "TBD");
  assert.equal(wh[rows[0].indexOf("Report selection")], r.selection);
});

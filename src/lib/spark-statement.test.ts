import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateStatement, metricAmount } from "./financial.ts";
import { statementLines } from "./prime-reports.ts";
import { statementFinancialLine } from "./statement-values.ts";
import { money } from "./reporting.ts";
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/spark-statement-v3.8.json", import.meta.url),
    "utf8",
  ),
);

test("Spark consumes the API row hierarchy and exact metrics without a second financial subtotal", () => {
  const report = validateStatement(structuredClone(fixture), "spark", 2026);
  const rows = statementLines("spark", "individual", report);
  for (const row of rows) {
    const api = report.statement_rows!.find((r) => r.id === row.id)!;
    assert.equal(row.label, api.label);
    assert.equal(row.level, api.depth);
    if (row.kind !== "section")
      assert.strictEqual(
        statementFinancialLine(report, row),
        report.lines.find((l) => l.id === api.metric_id),
      );
    assert.equal(row.sources, undefined);
  }
  assert.equal(
    rows.filter((r) => r.id.startsWith("allocation.anchorage.loan")).length,
    0,
  );
  const anchorage = rows.find((r) => r.id === "allocation.anchorage")!;
  assert.equal(
    metricAmount(statementFinancialLine(report, anchorage)!.values["2026-10"]),
    "967807",
  );
  assert.equal(
    statementFinancialLine(report, anchorage)!.values["2026-10"].recognition,
    "receipt",
  );
  assert.equal(
    statementFinancialLine(report, rows.find((r) => r.id === "dr")!)!.values[
      "2026-10"
    ].value,
    null,
  );
});

test("API hierarchy rejects missing metrics, duplicate IDs, orphaned parents and wrong depths", () => {
  for (const mutate of [
    (r: typeof fixture) => {
      r.statement_rows[1].metric_id = "missing";
    },
    (r: typeof fixture) => {
      r.statement_rows[1].id = r.statement_rows[0].id;
    },
    (r: typeof fixture) => {
      r.statement_rows[2].parent = "missing";
    },
    (r: typeof fixture) => {
      r.statement_rows[2].depth = 9;
    },
  ]) {
    const r = structuredClone(fixture);
    mutate(r);
    assert.throws(() => validateStatement(r, "spark", 2026));
  }
});

test("zero filtering uses exact amounts across elapsed months and keeps TBD, partial zero and nonzero dust", () => {
  const report = structuredClone(fixture);
  const key = "investment.sparklend.usdg";
  const line = report.lines.find((r: { id: string }) => r.id === key)!;
  for (const p of report.periods.filter(
    (p: { state: string }) => p.state !== "future",
  ))
    line.values[p.key] = {
      ...line.values[p.key],
      status: "available",
      value: "0",
      known_value: null,
    };
  assert.ok(
    !statementLines("spark", "individual", report).some((r) => r.id === key),
  );
  line.values["2026-10"].value = "0.001";
  assert.ok(
    statementLines("spark", "individual", report).some((r) => r.id === key),
  );
  assert.equal(money("0.001"), "0");
  line.values["2026-10"] = {
    ...line.values["2026-10"],
    status: "unavailable",
    value: null,
  };
  assert.ok(
    statementLines("spark", "individual", report).some((r) => r.id === key),
  );
  line.values["2026-10"] = {
    ...line.values["2026-10"],
    status: "partial",
    known_value: "0",
  };
  assert.ok(
    statementLines("spark", "individual", report).some((r) => r.id === key),
  );
});

test("stale source zeroes stay visible and older policy layouts cannot be replaced by optional metadata", () => {
  const r = structuredClone(fixture);
  const id = "investment.sparklend.usdg";
  const line = r.lines.find((l: { id: string }) => l.id === id);
  for (const period of r.periods.filter(
    (p: { state: string }) => p.state !== "future",
  ))
    line.values[period.key] = {
      ...line.values[period.key],
      status: "available",
      value: "0",
      known_value: null,
    };
  r.periods[9].stale = true;
  assert.ok(
    statementLines("spark", "individual", r).some((row) => row.id === id),
  );
  r.policy_version = "prime-management.spark-amms.v3.7";
  r.statement_rows = [
    {
      id: "unexpected",
      label: "unexpected",
      metric_id: id,
      parent: null,
      depth: 1,
      kind: null,
    },
  ];
  assert.ok(
    !statementLines("spark", "individual", r).some(
      (row) => row.id === "unexpected",
    ),
  );
});

test("historical statement policy exposes published January revenue through the API layout", () => {
  const report = JSON.parse(
    readFileSync(
      new URL("./fixtures/spark-history-v3.9.json", import.meta.url),
      "utf8",
    ),
  );
  const parsed = validateStatement(report, "spark", 2026);
  const line = parsed.lines.find(
    (r) => r.id === "investment.maple_syrup_usdc",
  )!;
  assert.equal(line.values["2026-01"].status, "available");
  assert.equal(line.values["2026-01"].quality, "estimate");
  assert.equal(line.values["2026-01"].value, "850905.46");
  assert.ok(parsed.statement_rows?.some((row) => row.metric_id === line.id));
});

test("history validates proved empty AMMs while rejecting a fabricated nonzero return", () => {
  const payload = JSON.parse(readFileSync(new URL("./fixtures/spark-history-v3.9.json", import.meta.url), "utf8"));
  validateStatement(payload, "spark", 2026);
  const row = payload.lines.find((r: { id: string }) => r.id === "investment.amm.uniswap_v4.rlusd_usds");
  assert.equal(row.values["2026-01"].allocation_split.sky_share_basis, "not_applicable_empty_position");
  row.values["2026-01"].allocation_split.gross_income_usd = "1";
  assert.throws(() => validateStatement(payload, "spark", 2026));
});

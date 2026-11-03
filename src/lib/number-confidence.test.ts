import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  numberConfidence,
  venueEvidence,
  warehouseUncertainty,
  statementUncertainty,
  readUncertainty,
  type Evidence,
} from "./number-confidence.ts";
import { metricAmount, type FinancialStatement } from "./financial.ts";
import type { Venue } from "./reporting.ts";
const supported: Evidence = {
  status: "available",
  recognition: "accrual",
  basis: "native_lending_yield",
};
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/grove-archive-statement.json", import.meta.url),
    "utf8",
  ),
) as FinancialStatement;

test("supported accrued income and earned returns are green, regardless of sign or zero", () => {
  for (const value of ["0", "100.50", "-100.50"]) {
    assert.equal(numberConfidence(value, supported).tone, "accrual");
    assert.equal(
      numberConfidence(value, {
        ...supported,
        recognition: "investment_return",
      }).tone,
      "accrual",
    );
  }
});
test("supported receipts and realized gains are blue; in-kind is not asserted to be bank cash", () => {
  for (const recognition of ["receipt", "receipt_in_kind", "realized_gain"]) {
    assert.equal(
      numberConfidence("100", { ...supported, recognition }).tone,
      "cash",
    );
    assert.equal(
      numberConfidence("-100", { ...supported, recognition }).tone,
      "cash",
    );
  }
});
test("uncertainty wins over recognition; partial or mixed aggregates cannot appear certified", () => {
  for (const evidence of [
    { ...supported, quality: "estimate" as const },
    { ...supported, status: "partial" as const },
    { ...supported, status: "unavailable" as const },
    { ...supported, recognition: "mixed_management_components" },
    { ...supported, recognition: "unknown" },
    { ...supported, basis: "unclassified" },
    { ...supported, basis: "  UNCLASSIFIED  " },
    { ...supported, basis: " " },
    { ...supported, recognition: "valuation" },
    { ...supported, recognition: "balance" },
    { ...supported, recognition: "capital_flow" },
    { ...supported, recognition: "estimated_accrual" },
    { ...supported, recognition: "recorded_change" },
    undefined,
  ])
    assert.equal(numberConfidence("100", evidence).tone, "uncertain");
  assert.equal(
    numberConfidence("100", supported, { uncertainReason: "Servicing pending" })
      .tone,
    "uncertain",
  );
});
test("missing amounts are red, future dashes stay neutral, and missing is not a zero", () => {
  assert.equal(numberConfidence(null, supported).tone, "missing");
  assert.equal(
    numberConfidence(undefined, undefined, { uncertainReason: "Not confirmed" })
      .tone,
    "missing",
  );
  assert.equal(
    numberConfidence(null, undefined, { future: true }).tone,
    "future",
  );
  assert.equal(
    numberConfidence("100", { ...supported, status: "future" }).tone,
    "future",
  );
  assert.equal(numberConfidence("0", supported).tone, "accrual");
});
test("real archive cases retain their distinct confidence and basis", () => {
  const find = (id: string, month: string) =>
    fixture.lines.find((row) => row.id === id)!.values[month];
  for (const [id, month, expected] of [
    ["investment.offchain.gaclo", "2026-01", "accrual"],
    ["investment.offchain.gaclo", "2026-08", "uncertain"],
    ["investment.rwa.stac", "2026-01", "accrual"],
    ["rewards.issuer.agora", "2026-01", "cash"],
    ["rewards.issuer.agora", "2026-03", "uncertain"],
    ["rewards.issuer.usdg", "2026-08", "uncertain"],
    ["gains.plume_disposal", "2026-06", "cash"],
    ["rewards.lending.aave.eth_rlusd", "2026-02", "uncertain"],
  ]) {
    const item = find(id, month);
    assert.equal(
      numberConfidence(metricAmount(item), item).tone,
      expected,
      `${id}/${month}`,
    );
  }
});
test("Warehouse supported schedules remain uncertain pending servicing, including family subtotals", () => {
  const r = structuredClone(fixture);
  const income = r.lines.find(
    (row) => row.id === "investment.offchain.warehouse",
  )!.values["2026-07"];
  assert.equal(income.quality, "supported");
  assert.match(
    warehouseUncertainty("investment.offchain.warehouse", income)!,
    /servicing/,
  );
  assert.match(
    statementUncertainty(r, "statement.family.offchain_lending", "2026-07")!,
    /servicing/,
  );
  assert.match(
    statementUncertainty(r, "statement.family.offchain_lending")!,
    /servicing|Delayed/,
  );
  const cash = r.offchain_positions!.find((p) => p.source_venue_id === "E42")!
    .values["2026-08"].metrics.cash_received;
  assert.equal(
    warehouseUncertainty("investment.offchain.warehouse", cash),
    null,
  );
  assert.equal(numberConfidence(metricAmount(cash), cash).tone, "cash");
});
test("delayed publications, corrections and retained fallbacks cannot be green or blue", () => {
  const r = structuredClone(fixture),
    id = "investment.rwa.stac";
  r.periods[0].stale = true;
  assert.match(statementUncertainty(r, id, "2026-01")!, /Delayed/);
  r.periods[0].stale = false;
  r.source_lag_periods = [r.periods[0].actual_cutoff!];
  assert.match(statementUncertainty(r, id, "2026-01")!, /correction/);
  assert.match(statementUncertainty(r, id, "2026-02", true)!, /Retained/);
  assert.equal(statementUncertainty(r, id, "2026-02"), null);
  assert.match(
    readUncertainty({
      retained: false,
      report: { freshness: { stale: true } },
    })!,
    /delayed/,
  );
  assert.match(readUncertainty({ retained: true, report: null })!, /Retained/);
});
test("legacy venue availability does not certify accrual; explicit fields/methods retain meaning", () => {
  const v = { enabled: true, status: "available", method: "existing" } as Venue;
  assert.equal(
    numberConfidence("0", venueEvidence(v, "income")).tone,
    "uncertain",
  );
  assert.equal(
    numberConfidence("100", venueEvidence(v, "balance")).tone,
    "uncertain",
  );
  assert.equal(numberConfidence("100", venueEvidence(v, "cash")).tone, "cash");
  assert.equal(
    numberConfidence(
      "100",
      venueEvidence({ ...v, method: "loan_accrual" }, "income"),
    ).tone,
    "accrual",
  );
  assert.equal(
    numberConfidence(
      "100",
      venueEvidence({ ...v, method: "alm_receipts" }, "income"),
    ).tone,
    "cash",
  );
  assert.equal(
    numberConfidence(
      "100",
      venueEvidence({ ...v, status: "unavailable" }, "cash"),
    ).tone,
    "uncertain",
  );
});
test("cyclic component metadata cannot recurse forever", () => {
  const r = structuredClone(fixture),
    a = r.lines.find((row) => row.id === "investment.rwa.stac")!;
  a.components = [{ id: a.id, sign: 1 }];
  assert.match(statementUncertainty(r, a.id, "2026-01")!, /cyclic/);
});

test("published override follows its actual dependency, not unavailable template children", () => {
  const r = structuredClone(fixture);
  const demand = r.lines.find((row) => row.id === "statement.demand")!;
  demand.components = [{ id: "unknown.template.child", sign: 1 }];
  assert.deepEqual(demand.values["2026-01"].component_ids, ["demand.total"]);
  assert.equal(statementUncertainty(r, demand.id, "2026-01"), null);
  demand.values["2026-01"].component_ids = [];
  assert.match(
    statementUncertainty(r, demand.id, "2026-01")!,
    /Component confidence/,
  );
});

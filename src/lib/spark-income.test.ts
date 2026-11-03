import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { financialLine, validateStatement, type FinancialStatement } from "./financial.ts";
import { statementLines } from "./prime-reports.ts";
import { sparkIncomePolicy } from "./financial-policies.ts";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/financial-statement.json", import.meta.url), "utf8"));
function report(): FinancialStatement {
  const doc = structuredClone(fixture) as FinancialStatement;
  doc.prime = "spark";
  doc.policy_version = sparkIncomePolicy;
  return doc;
}
function gain(doc: FinancialStatement, value = "0") {
  const row = structuredClone(doc.lines[0]);
  row.id = "gains.morpho";
  row.label = "MORPHO";
  row.aggregation = "leaf";
  for (const p of doc.periods) row.values[p.key] = {
    ...row.values[p.key], status: p.state === "future" ? "future" : "available",
    value: p.state === "future" ? null : value, known_value: null,
    recognition: "accrual", basis: "supported_price_revaluation", reason: null,
  };
  doc.lines.push(row);
  return row;
}
const visible = (doc: FinancialStatement, id = "gains.morpho") =>
  statementLines("spark", "individual", doc).some((row) => row.id === id);

test("Spark uses SparkLend fees and reserve receipts appear only under that row", () => {
  const doc = report();
  const receipt = { ...structuredClone(doc.lines[0]), id: "rewards.lending.sparklend.usds", label: "SparkLend USDS reserve treasury receipts", aggregation: "leaf" as const };
  const fees = { ...structuredClone(doc.lines[0]), id: "fees.sparklend" };
  doc.lines.push(receipt, fees);
  const rows = statementLines("spark", "individual", doc);
  assert.equal(rows.find((r) => r.id === "protocol")?.label, "SparkLend fees");
  assert.deepEqual(rows.filter((r) => r.id === receipt.id).map((r) => r.parent), ["protocol"]);
  assert.equal(financialLine(doc, "protocol"), fees);
  assert.equal(statementLines("grove", "individual").find((r) => r.id === "protocol")?.label, "Protocol fees");
});

test("only confirmed zero gain rows disappear, with unknown and future periods preserved", () => {
  const doc = report();
  doc.periods.forEach((p) => { p.stale = false; });
  const row = gain(doc);
  assert.equal(visible(doc), false);
  const elapsed = doc.periods.filter((p) => p.state !== "future");
  const cell = row.values[elapsed[0].key];
  cell.value = null; cell.status = "unavailable";
  assert.equal(visible(doc), true);
  cell.status = "partial"; cell.known_value = "0";
  assert.equal(visible(doc), true);
  cell.status = "available"; cell.value = "0"; cell.known_value = null; cell.quality = "estimate";
  assert.equal(visible(doc), true);
  delete cell.quality;
  cell.value = "10";
  row.values[elapsed[1].key].value = "-10";
  assert.equal(visible(doc), true); // A zero YTD does not erase monthly gains/losses.
});

test("stale and lagging zero evidence stays visible", () => {
  const doc = report();
  doc.periods.forEach((p) => { p.stale = false; });
  gain(doc);
  doc.periods[0].stale = true;
  assert.equal(visible(doc), true);
  doc.periods[0].stale = false;
  doc.source_lag_periods = ["2026-10-26"];
  assert.equal(visible(doc), true);
});

test("the real Spark v3.6 projection passes source and derived-subtotal validation", () => {
  // Retained source metadata and eight fee-related lines from a read-only
  // production projection. Unrelated lines are omitted from this fixture.
  const path = new URL("./fixtures/spark-fees-statement.json", import.meta.url);
  const doc = validateStatement(JSON.parse(readFileSync(path, "utf8")), "spark", 2026);
  assert.equal(financialLine(doc, "protocol")?.values["2026-10"].recognition, "receipt_in_kind");
  const broken = structuredClone(doc);
  financialLine(broken, "protocol")!.values["2026-10"].source_refs = [];
  assert.throws(() => validateStatement(broken, "spark", 2026));
  const missing = structuredClone(doc);
  const residual = missing.lines.find((l) => l.id === "rewards.unattributed_sparklend_receipts")!;
  // Unpublished months must omit optional references, rather than emit null.
  Object.assign(residual.values["2026-01"], { source_ref: null });
  assert.throws(() => validateStatement(missing, "spark", 2026));
});

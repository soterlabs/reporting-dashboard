import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateStatement,
  validatePortfolio,
  financialLine,
} from "./financial.ts";
import { readFileSync } from "node:fs";
const statement = JSON.parse(
  readFileSync(
    new URL("./fixtures/financial-statement.json", import.meta.url),
    "utf8",
  ),
);
const portfolio = JSON.parse(
  readFileSync(
    new URL("./fixtures/financial-portfolio.json", import.meta.url),
    "utf8",
  ),
);
test("saved backend contracts bind supported leaves and preserve unavailable YTD", () => {
  const v = validateStatement(statement, "obex", 2026);
  assert.equal(
    financialLine(v, "ar")?.values["2026-10"].value,
    "12.000000000000000001",
  );
  assert.equal(financialLine(v, "ar")?.total.value, null);
  assert.equal(financialLine(v, "net-income"), undefined);
  assert.equal(financialLine(v, "obex-maple")?.values["2026-10"].value, "100");
  assert.throws(() => validateStatement(statement, "spark", 2026));
  const bad = structuredClone(statement);
  bad.lines[0].values["2026-10"].value = 12;
  assert.throws(() => validateStatement(bad, "obex", 2026));
  bad.lines[0].values["2026-10"].value = null;
  assert.throws(() => validateStatement(bad, "obex", 2026));
});
test("portfolio validates prime, month, and matching v2 source revision", () => {
  assert.equal(
    validatePortfolio(
      portfolio,
      "obex",
      "2026-10",
      portfolio.source.revision_id,
    ).portfolio.closing_value.value,
    "1100",
  );
  assert.throws(() => validatePortfolio(portfolio, "obex", "2026-09"));
  assert.throws(() =>
    validatePortfolio(portfolio, "obex", "2026-10", "a".repeat(64)),
  );
  const bad = structuredClone(portfolio);
  bad.portfolio.closing_value.value = "NaN";
  assert.throws(() => validatePortfolio(bad, "obex", "2026-10"));
});

test("reject inconsistent periods, unbacked values and complete YTD over missing months", () => {
  for (const mutate of [
    (v: typeof statement) => {
      v.periods[9].actual_cutoff = "2026-09-26";
    },
    (v: typeof statement) => {
      v.periods[9].financial_revision = null;
    },
    (v: typeof statement) => {
      v.periods[9].stale = false;
    },
    (v: typeof statement) => {
      v.periods[8].actual_cutoff = "2026-09-29";
      v.periods[8].financial_revision = "c".repeat(64);
    },
    (v: typeof statement) => {
      v.lines[0].values["2026-11"] = structuredClone(
        v.lines[0].values["2026-10"],
      );
    },
    (v: typeof statement) => {
      v.lines[0].total = structuredClone(v.lines[0].values["2026-10"]);
    },
  ]) {
    const bad = structuredClone(statement);
    mutate(bad);
    assert.throws(() => validateStatement(bad, "obex", 2026));
  }
  assert.throws(() =>
    validateStatement(statement, "obex", 2026, "different-selection"),
  );
});

test("portfolio exact cutoff and revision must match; duplicate members are rejected", () => {
  assert.throws(() =>
    validatePortfolio(portfolio, "obex", "2026-10", undefined, "2026-10-27"),
  );
  assert.throws(() =>
    validatePortfolio(
      portfolio,
      "obex",
      "2026-10",
      undefined,
      undefined,
      "c".repeat(64),
    ),
  );
  const bad = structuredClone(portfolio);
  bad.portfolio.positions.push(structuredClone(bad.portfolio.positions[0]));
  assert.throws(() => validatePortfolio(bad, "obex", "2026-10"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  validateStatement,
  financialLine,
  metricAmount,
  type FinancialStatement,
} from "./financial.ts";
import { statementLines, yearMonths } from "./prime-reports.ts";
import { archiveCsvRows, statementCsvRows } from "./financial-export.ts";
const fixture = JSON.parse(
  readFileSync(
    new URL("./fixtures/grove-archive-statement.json", import.meta.url),
    "utf8",
  ),
);

test("archive income validates and each new leaf has one statement location", () => {
  const r = validateStatement(structuredClone(fixture), "grove", 2026);
  assert.equal(r.archive_income!.length, 34);
  assert.equal(
    r.archive_income!.filter((row) => row.included_in_totals).length,
    22,
  );
  const rows = statementLines("grove", "individual", r);
  for (const key of [
    "rewards.issuer.agora",
    "rewards.issuer.usdg",
    "rewards.partnership.plume",
    "gains.plume_disposal",
    "investment.morpho.grove_monad_ausd",
  ])
    assert.equal(rows.filter((row) => row.id === key).length, 1);
  assert.equal(
    rows.find((row) => row.id === "gains.plume_disposal")!.parent,
    "gains",
  );
  assert.equal(
    metricAmount(financialLine(r, "gains")!.values["2026-06"]),
    "1102056.359999",
  );
  assert.equal(
    rows.find((row) => row.id === "rewards.issuer.agora")!.parent,
    "interest",
  );
  assert.equal(
    rows.find((row) => row.id === "rewards.partnership.plume")!.parent,
    "rewards",
  );
});

test("archive CSV preserves receipt recognition, estimate valuation and non-additive scenarios", () => {
  const r = validateStatement(structuredClone(fixture), "grove", 2026);
  const csv = archiveCsvRows(r);
  assert.equal(csv.length, 35);
  const column = (name: string) => csv[0].indexOf(name);
  const included = csv
    .slice(1)
    .filter((row) => row[column("Included in statement")] === "yes");
  assert.equal(included.length, 22);
  const scenario = csv.find(
    (row) => row[column("Recognition")] === "estimated_accrual",
  )!;
  assert.equal(scenario[column("Included in statement")], "no");
  const merkl = csv.find(
    (row) => row[column("Recognition")] === "receipt_in_kind",
  )!;
  assert.equal(merkl[column("Source currency")], "aEthRLUSD");
  assert.equal(merkl[column("Quality")], "estimate");
  assert.equal(merkl[column("Coverage")], "partial");
  assert.equal(merkl[column("Report selection")], r.selection);
  const main = statementCsvRows(
    "grove",
    "individual",
    2026,
    "2026-11",
    yearMonths(2026),
    r,
  );
  assert.equal(
    main.filter((row) => String(row[2]).includes("scenario")).length,
    0,
  );
  assert.equal(
    main.find((row) => row[2] === "PLUME disposal gain")![8],
    "1102056.359999",
  );
});

test("reject unbacked, duplicate, reclassified and cross-month archive figures", () => {
  const changes = [
    (r: FinancialStatement) => {
      r.archive_income!.find(
        (row) => row.id === "monad",
      )!.balances!.closing_value.value = "999";
    },
    (r: FinancialStatement) => {
      r.archive_income![0].metric.value = "999";
    },
    (r: FinancialStatement) => {
      r.archive_income!.push(r.archive_income![0]);
    },
    (r: FinancialStatement) => {
      r.archive_income![0].month = "2026-12";
    },
    (r: FinancialStatement) => {
      const row = r.archive_income!.find((row) => !row.included_in_totals)!;
      row.included_in_totals = true;
    },
    (r: FinancialStatement) => {
      r.archive_income![0].metric.source_ref = "f".repeat(64);
    },
    (r: FinancialStatement) => {
      r.archive_income!.splice(
        r.archive_income!.findIndex((row) => row.included_in_totals),
        1,
      );
    },
  ];
  for (const change of changes) {
    const r = structuredClone(fixture);
    change(r);
    assert.throws(() => validateStatement(r, "grove", 2026));
  }
});

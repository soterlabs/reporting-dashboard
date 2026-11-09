import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { financialPortfolio, financialStatements } from "./api.ts";
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

test("retained financial requests reject substituted reports and pin portfolio/source selection together", async (t) => {
  const requests: URL[] = [];
  t.mock.method(globalThis, "fetch", async (url: string) => {
    requests.push(new URL(url));
    return Response.json(url.includes("/statements?") ? statement : portfolio);
  });
  const wrong = await financialStatements("obex", 2026, "wrong-selection");
  assert.equal(wrong.report, null);
  const retained = await financialStatements("obex", 2026, statement.selection);
  assert.equal(retained.report?.selection, statement.selection);
  const result = await financialPortfolio(
    "obex",
    "2026-10",
    portfolio.source.revision_id,
    portfolio.cutoff,
    portfolio.financial_revision,
  );
  assert.equal(result.report?.financial_revision, portfolio.financial_revision);
  const request = requests.at(-1)!;
  assert.equal(
    request.searchParams.get("revision"),
    portfolio.financial_revision,
  );
  assert.equal(request.searchParams.has("source_revision"), false); // API selectors are mutually exclusive
  assert.equal(request.searchParams.get("cutoff"), portfolio.cutoff);
  const mismatched = await financialPortfolio(
    "obex",
    "2026-10",
    undefined,
    "2026-10-27",
    "a".repeat(64),
  );
  assert.equal(mismatched.report, null);
});

test("venue exports request the retained raw revision and reject a substituted publication", async (t) => {
  const { report } = await import("./api.ts");
  const raw = {
    schema_version: "2.0",
    prime: "obex",
    view: "reporting",
    estimate_basis: "month_to_date",
    data: {
      cutoff: "2026-10-26",
      revision_id: "d".repeat(64),
      source_result_hash: "e".repeat(64),
      view_hash: "f".repeat(64),
      computed_at: "2026-10-27T00:00:00Z",
      provisional: true,
      excluded_inputs: [],
      code_version: "code",
      configuration_version: "config",
      input_revision: "input",
      result: {
        period: { start: "2026-10-01", end: "2026-10-26" },
        venues: [],
        totals: null,
        complete: true,
      },
    },
    freshness: {
      stale: true,
      actual_cutoff: "2026-10-26",
      expected_cutoff: "2026-10-27",
    },
    latest_attempt: null,
  };
  let last: URL;
  t.mock.method(globalThis, "fetch", async (url: string) => {
    last = new URL(url);
    return Response.json(raw);
  });
  const retained = await report("obex", "2026-10-26", raw.data.revision_id);
  assert.equal(retained.report?.data.revision_id, raw.data.revision_id);
  assert.equal(last!.searchParams.get("revision"), raw.data.revision_id);
  assert.equal(
    (await report("obex", "2026-10-26", "b".repeat(64))).report,
    null,
  );
});

test("live statements replace a cached TBD and retain the last good response only on failure", async (t) => {
  const missing = structuredClone(statement);
  const row = missing.lines.find(
    (r: { id: string }) => r.id === "demand.agent_rate",
  );
  row.values["2026-10"] = {
    value: null,
    known_value: null,
    unit: "USD",
    status: "unavailable",
    recognition: "unknown",
    basis: "unclassified",
    reason: "source_not_published",
    source_paths: [],
  };
  row.total = { ...row.values["2026-10"] };
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    if (calls === 3) return new Response("unavailable", { status: 503 });
    return Response.json(calls === 1 ? missing : statement);
  });
  const before = await financialStatements("obex", 2026);
  assert.equal(
    before.report?.lines.find((r) => r.id === "demand.agent_rate")?.values[
      "2026-10"
    ].value,
    null,
  );
  const after = await financialStatements("obex", 2026);
  assert.equal(
    after.report?.lines.find((r) => r.id === "demand.agent_rate")?.values[
      "2026-10"
    ].value,
    "12.000000000000000001",
  );
  assert.equal(after.retained, false);
  const failed = await financialStatements("obex", 2026);
  assert.equal(failed.retained, true);
  assert.equal(failed.report?.selection, after.report?.selection);
  assert.equal(calls, 3);
});

test("pinned statements remain immutable and cached", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json(statement);
  });
  const a = await financialStatements("obex", 2026, statement.selection);
  const b = await financialStatements("obex", 2026, statement.selection);
  assert.equal(a.report?.selection, b.report?.selection);
  assert.ok(calls <= 1);
});


test("live Spark reads opt into reviewed policies while retained reads preserve their selectors",async(t)=>{
 const {cashFlowReport}=await import("./api.ts");
 const calls:URL[]=[];
 t.mock.method(globalThis,"fetch",async(url:string)=>{calls.push(new URL(url));return Response.json({});});
 await financialStatements("spark",2026);
 assert.equal(calls.at(-1)!.searchParams.get("review"),"true");
 assert.equal(calls.at(-1)!.searchParams.get("accounting"),"true");
 await cashFlowReport("spark",2026);
 assert.equal(calls.at(-1)!.searchParams.get("review"),"true");
 await cashFlowReport("spark",2026,"retained-selection");
 assert.equal(calls.at(-1)!.searchParams.has("review"),false);
 assert.equal(calls.at(-1)!.searchParams.get("revision"),"retained-selection");
});

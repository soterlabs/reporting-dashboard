import { test } from "node:test";
import assert from "node:assert/strict";
import { monthReport } from "./report-data.ts";
import { yearMonths } from "./prime-reports.ts";
import type { ReadResult, Report } from "./reporting.ts";
function read(cutoff: string): ReadResult {
  return {
    report: { data: { cutoff } } as Report,
    message: null,
    verifiedAt: "2026-10-28T00:00:00Z",
    retained: false,
  };
}
const months = yearMonths(2026, new Date("2026-10-28T00:00:00Z"));
test("current month uses a delayed publication only from that month and exposes its actual cutoff", async () => {
  const result = await monthReport("grove", months[9], {
    latest: async () => read("2026-10-26"),
    at: async () => {
      throw Error("unexpected historical request");
    },
  });
  assert.equal(result.actualCutoff, "2026-10-26");
  assert.equal(result.month.cutoff, "2026-10-27");
  const wrongMonth = await monthReport("grove", months[9], {
    latest: async () => read("2026-09-30"),
    at: async () => {
      throw Error("unexpected historical request");
    },
  });
  assert.equal(wrongMonth.read.report, null);
});
test("historical months require exact month ends, while future months make no API calls", async () => {
  const calls: string[] = [];
  const client = {
    latest: async () => {
      throw Error("unexpected latest request");
    },
    at: async (_prime: string, cutoff: string) => {
      calls.push(cutoff);
      return read(cutoff);
    },
  };
  const historical = await monthReport("obex", months[8], client);
  assert.equal(historical.actualCutoff, "2026-09-30");
  const future = await monthReport("obex", months[10], client);
  assert.equal(future.read.report, null);
  assert.deepEqual(calls, ["2026-09-30"]);
});

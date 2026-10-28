import { latestReport, report } from "./api.ts";
import { PRIMES, type Prime, type ReadResult } from "./reporting.ts";
import {
  type Month,
  type MonthReport,
  type Scope,
  yearMonths,
} from "./prime-reports.ts";

function empty(message: string): ReadResult {
  return { report: null, retained: false, verifiedAt: null, message };
}
export async function monthReport(
  prime: Prime,
  month: Month,
  client = { latest: latestReport, at: report },
): Promise<MonthReport> {
  if (!month.cutoff)
    return { month, read: empty("Future period"), actualCutoff: null };
  // Current partial months can use the latest publication, with its actual date visible.
  // Past months require the exact month end; never silently replace it with a partial month.
  if (month.state === "partial") {
    const read = await client.latest(prime);
    const cutoff = read.report?.data.cutoff;
    if (cutoff && cutoff.startsWith(month.key) && cutoff <= month.cutoff)
      return { month, read, actualCutoff: cutoff };
    if (!read.report) return { month, read, actualCutoff: null };
    return {
      month,
      read: empty("No publication in the selected month"),
      actualCutoff: null,
    };
  }
  const read = await client.at(prime, month.cutoff);
  return { month, read, actualCutoff: read.report?.data.cutoff || null };
}
export async function annualReports(
  prime: Prime,
  year: number,
): Promise<MonthReport[]> {
  const months = yearMonths(year);
  const results: MonthReport[] = [];
  // Bound upstream concurrency. API calls only read saved publications.
  for (let index = 0; index < months.length; index += 4)
    results.push(
      ...(await Promise.all(
        months.slice(index, index + 4).map((m) => monthReport(prime, m)),
      )),
    );
  return results;
}
export async function portfolioReports(
  prime: Prime,
  scope: Scope,
  month: Month,
) {
  return Promise.all(
    (scope === "combined" ? PRIMES : [prime]).map(async (p) => ({
      prime: p,
      ...(await monthReport(p, month)),
    })),
  );
}

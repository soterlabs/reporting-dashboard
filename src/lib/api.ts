import {
  validateStatement,
  validatePortfolio,
  type FinancialStatement,
  type FinancialPortfolio,
  type FinancialRead,
} from "./financial.ts";
import { validateReport, type Prime, type ReadResult } from "./reporting.ts";

const BASE = (
  process.env.REPORTING_API_URL ||
  "https://settle-api-production.up.railway.app"
).replace(/\/+$/, "");
// Only these read-only reporting paths are used; no settlement, RPC or database access.
const cache = new Map<
  string,
  { value: unknown; until: number; verifiedAt: string }
>();
const pending = new Map<
  string,
  Promise<{ value: unknown; retained: boolean; verifiedAt: string }>
>();
function errorMessage(status: number) {
  return status === 409
    ? "Reporting view not yet published"
    : status === 404
      ? "No publication for this date"
      : "Reporting API unavailable";
}
async function read(path: string, validate: (v: unknown) => unknown) {
  const previous = cache.get(path);
  if (previous && previous.until > Date.now())
    return {
      value: previous.value,
      retained: false,
      verifiedAt: previous.verifiedAt,
    };
  const inFlight = pending.get(path);
  if (inFlight) return inFlight;
  const work = (async () => {
    try {
      const response = await fetch(`${BASE}${path}`, {
        signal: AbortSignal.timeout(12000),
        cache: "no-store",
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error(errorMessage(response.status));
      const value = validate(await response.json());
      const verifiedAt = new Date().toISOString();
      cache.delete(path);
      cache.set(path, { value, until: Date.now() + 300000, verifiedAt });
      if (cache.size > 150) cache.delete(cache.keys().next().value!);
      return { value, retained: false, verifiedAt };
    } catch (e) {
      if (previous)
        return {
          value: previous.value,
          retained: true,
          verifiedAt: previous.verifiedAt,
        };
      throw e;
    }
  })();
  pending.set(path, work);
  try {
    return await work;
  } finally {
    pending.delete(path);
  }
}
export async function report(
  prime: Prime,
  cutoff: string,
  revision?: string,
): Promise<ReadResult> {
  try {
    const r = await read(
      `/v2/reporting/${prime}/at/${cutoff}${revision ? `?${new URLSearchParams({ revision })}` : ""}`,
      (value) => {
        const doc = validateReport(value, prime);
        if (
          doc.data.cutoff !== cutoff ||
          (revision && doc.data.revision_id !== revision)
        )
          throw new Error("Reporting date mismatch");
        return doc;
      },
    );
    return {
      report: r.value as ReturnType<typeof validateReport>,
      retained: r.retained,
      verifiedAt: r.verifiedAt,
      message: r.retained
        ? "Refresh failed; showing last verified publication"
        : null,
    };
  } catch (e) {
    return {
      report: null,
      retained: false,
      verifiedAt: null,
      message: e instanceof Error ? e.message : "Reporting API unavailable",
    };
  }
}
export async function latestReport(prime: Prime): Promise<ReadResult> {
  try {
    const r = await read(`/v2/reporting/${prime}/latest`, (value) =>
      validateReport(value, prime),
    );
    return {
      report: r.value as ReturnType<typeof validateReport>,
      retained: r.retained,
      verifiedAt: r.verifiedAt,
      message: r.retained
        ? "Refresh failed; showing last checked publication"
        : null,
    };
  } catch (e) {
    return {
      report: null,
      retained: false,
      verifiedAt: null,
      message: e instanceof Error ? e.message : "Reporting API unavailable",
    };
  }
}

export async function financialStatements(
  prime: Prime,
  year: number,
  revision?: string,
) {
  return financialRead<FinancialStatement>(
    `/v3/reporting/statements?${new URLSearchParams({ prime, year: String(year), ...(revision ? { revision } : {}) })}`,
    (v) => validateStatement(v, prime, year, revision),
  );
}
export async function financialPortfolio(
  prime: Prime,
  month: string,
  source_revision?: string,
  cutoff?: string,
  revision?: string,
) {
  return financialRead<FinancialPortfolio>(
    `/v3/reporting/portfolio?${new URLSearchParams({ prime, month, ...(source_revision && !revision ? { source_revision } : {}), ...(cutoff ? { cutoff } : {}), ...(revision ? { revision } : {}) })}`,
    (v) =>
      validatePortfolio(v, prime, month, source_revision, cutoff, revision),
  );
}
async function financialRead<T>(
  path: string,
  validate: (v: unknown) => T,
): Promise<FinancialRead<T>> {
  try {
    const result = await read(path, validate);
    return {
      report: result.value as T,
      retained: result.retained,
      message: result.retained
        ? "Refresh failed; showing retained financial publication"
        : null,
    };
  } catch (e) {
    return {
      report: null,
      retained: false,
      message:
        e instanceof Error ? e.message : "Financial reporting unavailable",
    };
  }
}

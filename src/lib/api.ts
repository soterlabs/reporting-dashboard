import { PRIMES, validatePublication, validateReport, type Prime, type Publication, type ReadResult } from './reporting.ts';

const BASE = (process.env.REPORTING_API_URL || 'https://settle-api-production.up.railway.app').replace(/\/+$/, '');
// Only these read-only reporting paths are used; no settlement, RPC or database access.
const cache = new Map<string, { value: unknown; until: number; verifiedAt: string }>();
const pending = new Map<string, Promise<{ value: unknown; retained: boolean; verifiedAt: string }>>();
function errorMessage(status: number) {
  return status === 409 ? 'Reporting view not yet published' : status === 404 ? 'No publication for this date' : 'Reporting API unavailable';
}
async function read(path: string, validate: (v: unknown) => unknown) {
  const previous = cache.get(path);
  if (previous && previous.until > Date.now()) return { value: previous.value, retained: false, verifiedAt: previous.verifiedAt };
  const inFlight = pending.get(path);
  if (inFlight) return inFlight;
  const work = (async () => {
    try {
      const response = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(12000), cache: 'no-store', headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(errorMessage(response.status));
      const value = validate(await response.json());
      const verifiedAt = new Date().toISOString();
      cache.delete(path);
      cache.set(path, { value, until: Date.now() + 300000, verifiedAt });
      if (cache.size > 150) cache.delete(cache.keys().next().value!);
      return { value, retained: false, verifiedAt };
    } catch (e) {
      if (previous) return { value: previous.value, retained: true, verifiedAt: previous.verifiedAt };
      throw e;
    }
  })();
  pending.set(path, work);
  try { return await work; } finally { pending.delete(path); }
}
export async function report(prime: Prime, cutoff: string): Promise<ReadResult> {
  try {
    const r = await read(`/v2/reporting/${prime}/at/${cutoff}`, value => {
      const doc = validateReport(value, prime);
      if (doc.data.cutoff !== cutoff) throw new Error('Reporting date mismatch');
      return doc;
    });
    return { report: r.value as ReturnType<typeof validateReport>, retained: r.retained, verifiedAt: r.verifiedAt, message: r.retained ? 'Refresh failed; showing last verified publication' : null };
  } catch (e) {
    return { report: null, retained: false, verifiedAt: null, message: e instanceof Error ? e.message : 'Reporting API unavailable' };
  }
}
export async function allReports(cutoff: string) {
  return Object.fromEntries(await Promise.all(PRIMES.map(async p => [p, await report(p, cutoff)]))) as Record<Prime, ReadResult>;
}
export async function history(prime: Prime, start: string, end: string): Promise<{ publications: Publication[]; message: string | null; verifiedAt: string | null }> {
  try {
    const r = await read(`/v2/reporting/${prime}/history?start=${start}&end=${end}&limit=90`, value => {
      const h = value as { schema_version: string; prime: string; view: string; estimate_basis: string; results: (Publication & { availability: string })[] };
      if (!h || h.schema_version !== '2.0' || h.prime !== prime || h.view !== 'reporting' || h.estimate_basis !== 'month_to_date' || !Array.isArray(h.results)) throw new Error('Invalid reporting history');
      const dates = new Set<string>();
      for (const item of h.results) {
        if (!['available', 'unavailable'].includes(item.availability) || typeof item.cutoff !== 'string' || item.cutoff < start || item.cutoff > end || dates.has(item.cutoff)) throw new Error('Invalid history date');
        dates.add(item.cutoff);
        if (item.availability === 'available') validatePublication(item);
      }
      return h.results.filter(item => item.availability === 'available');
    });
    return { publications: r.value as Publication[], message: r.retained ? 'Refresh failed; showing last verified history' : null, verifiedAt: r.verifiedAt };
  } catch (e) {
    return { publications: [], message: e instanceof Error ? e.message : 'Reporting history unavailable', verifiedAt: null };
  }
}

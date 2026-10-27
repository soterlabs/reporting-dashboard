import { test } from 'node:test';
import assert from 'node:assert/strict';
import { accruedIncome, amount, dailyChange, money, period, validatePublication, validateReport, type Publication, type Report, type Venue } from './reporting.ts';

const venue = (overrides: Partial<Venue> = {}): Venue => ({ venue_id: 'L1', label: 'Loan', chain: 'ethereum', method: 'loan_accrual', status: 'available', enabled: true, reason: null, opening_position_value_usd: '1000', position_value_usd: '1001', income_usd: '1', cash_received_usd: null, principal_usd: '1000', opening_unpaid_income_usd: '0', unpaid_income_usd: '1', ...overrides });
const pub = (cutoff: string, row = venue()): Publication => ({ cutoff, revision_id: 'a'.repeat(64), computed_at: '2026-10-27T00:00:00Z', provisional: true, excluded_inputs: [], source_result_hash: 'b'.repeat(64), view_hash: 'c'.repeat(64), code_version: 'code', configuration_version: 'config', input_revision: 'input', result: { venues: [row], complete: true, period: { start: `${cutoff.slice(0, 7)}-01`, end: cutoff }, totals: null } });

test('missing, zero and negative values retain their financial meaning', () => {
  assert.equal(money(null), 'TBD');
  assert.equal(money('0E-20'), '$0.00');
  assert.equal(money('-1234.565'), '($1,234.57)');
  assert.equal(money('9007199254740993.12'), '$9,007,199,254,740,993.12');
});
test('existing methods never imply confirmed accrual, even when income is zero', () => {
  assert.equal(accruedIncome(venue({ method: 'existing', income_usd: '0' })), null);
  assert.equal(accruedIncome(venue()), '1');
  assert.equal(accruedIncome(venue({ status: 'unavailable' })), null);
});
test('unavailable loan can disclose known cash without substituting it for accrual', () => {
  const row = venue({ status: 'unavailable', cash_received_usd: '100', income_usd: null });
  assert.equal(amount(row, 'cash_received_usd'), '100');
  assert.equal(amount(row, 'position_value_usd'), null);
  assert.equal(accruedIncome(row), null);
  assert.equal(amount({ ...row, enabled: false }, 'cash_received_usd'), null);
});
test('daily movement uses exact decimals and refuses missing days or method changes', () => {
  const current = pub('2026-10-03', venue({ income_usd: '9007199254740993.13' }));
  const before = pub('2026-10-02', venue({ income_usd: '9007199254740993.12' }));
  assert.equal(dailyChange(current, before, 'L1'), '0.01');
  assert.equal(dailyChange(current, pub('2026-10-01'), 'L1'), null);
  assert.equal(dailyChange(current, undefined, 'L1'), null);
  assert.equal(dailyChange(current, pub('2026-10-02', venue({ method: 'existing' })), 'L1'), null);
  assert.equal(dailyChange(pub('2026-11-01'), pub('2026-10-31'), 'L1'), '1');
  assert.equal(dailyChange(pub('2026-10-03', venue({ income_usd: '1' })), pub('2026-10-02', venue({ income_usd: '2' })), 'L1'), '-1');
});
test('report validator rejects non-reporting views, numbers, null substitutions and duplicates', () => {
  const valid: Report = { schema_version: '2.0', prime: 'obex', view: 'reporting', estimate_basis: 'month_to_date', data: pub('2026-10-26'), freshness: { stale: false, actual_cutoff: '2026-10-26', expected_cutoff: '2026-10-26' }, latest_attempt: null };
  assert.equal(validateReport(valid, 'obex'), valid);
  assert.throws(() => validateReport({ ...valid, view: 'settlement' }, 'obex'));
  assert.throws(() => validateReport(valid, 'spark'));
  assert.throws(() => validatePublication(pub('2026-10-26', venue({ income_usd: 1 as unknown as string }))));
  assert.throws(() => validatePublication(pub('2026-10-26', venue({ income_usd: undefined as unknown as string }))));
  assert.throws(() => validatePublication(pub('2026-10-26', venue({ income_usd: 'NaN' }))));
  const duplicate = pub('2026-10-26'); duplicate.result.venues.push(venue());
  assert.throws(() => validatePublication(duplicate));
});
test('periods use completed UTC days including month boundaries and leap years', () => {
  assert.equal(period(undefined, new Date('2026-11-01T10:00:00Z')).cutoff, '2026-10-31');
  assert.equal(period('2024-02', new Date('2026-10-27T00:00:00Z')).cutoff, '2024-02-29');
  assert.equal(period('2026-12', new Date('2026-10-27T00:00:00Z')).month, '2026-10');
  assert.equal(period('2026-10', new Date('2026-10-27T00:00:00Z')).cutoff, '2026-10-26');
});

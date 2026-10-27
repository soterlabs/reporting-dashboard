# Sky reporting dashboard

Pro forma financial reporting for Sky and its prime-agent portfolios. Styled after [soterlabs/msc-dashboard](https://github.com/soterlabs/msc-dashboard).

## Run

Requires Node.js 22 or later.

```sh
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env.local
npm run dev
```

```sh
npm test
npm run typecheck
npm run build
npm start
```

## Data source

Only the settlement-cycle **v2 reporting API** is consumed, server-side:

- `/v2/reporting/{prime}/at/{cutoff}`
- `/v2/reporting/{prime}/history?start=...&end=...&limit=90`

`REPORTING_API_URL` defaults to `https://settle-api-production.up.railway.app`. No API key is currently required. No settlement API, blockchain RPC, database, CSV import, or alternate financial source is used. Requests cannot initiate calculations. Successful responses are validated and cached for five minutes; a failed refresh can retain the last verified response for that exact request with a visible warning. Cache is process-local and clears on restart. Refresh respects that five-minute cache.

Contract: [Settlement and reporting dashboard API](https://github.com/soterlabs/settlement-cycle/blob/main/docs/pipeline/settlement-reporting-api.md).

## Accounting treatment

- All statements are pro forma, provisional, and unaudited. USD values use exact decimal arithmetic, rounded to cents only for display. CSV exports retain source precision and publication identifiers.
- Cutoffs are completed UTC days. Income is month to date; carrying values are closing balances.
- Reported income is disclosed per allocation. The API's `existing` method does **not** certify accrual accounting. Only available `loan_accrual` income is shown as confirmed accrued income.
- No portfolio values or income rows are summed. Holdings, savings vaults, incentive claims, and cash receipts can overlap; an approved consolidation map is required.
- Funding costs, fees, operating expenses, credit losses, consolidated net income, and allocation yields remain **TBD** until the reporting API supplies confirmed inputs. The unmerged allocation-capital-cost PR is not consumed.
- Missing/null data is **TBD**, never zero. Known cash income remains separately exportable even when loan accrual is unavailable. Disabled allocations are excluded.
- Daily changes use consecutive published MTD values within a month. First-of-month values begin the new month. Gaps or method changes produce TBD. The latest revision per cutoff is used; differences may contain revisions. Both revision identities are exported. These are daily movements in reported income, not certified daily earnings.
- Historical screens use frozen reporting rows, never current venue configuration. No fabricated or demonstration figures appear in the application.

## Pending accounting decisions

1. Confirm the Sky consolidation perimeter, including income and expenses outside prime agents.
2. Confirm expense lines: funding costs, agent fees, incentives, operating expenses, credit losses, and intragroup eliminations.
3. Supply an approved overlap/elimination map and accrual recognition policy through the reporting API.
4. Confirm contractual loan terms and receipt classifications for unavailable loans upstream.

## Railway

`railway.json` builds with Railpack and runs Next.js on Railway's supplied `PORT`. Health check: `/api/health` (application readiness, independent of financial-data availability). Set only `REPORTING_API_URL` if a different reporting host is needed. Do not copy database, RPC, or GitHub credentials from other projects.

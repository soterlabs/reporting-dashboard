# Prime-agent reporting dashboard

Annual income statements and monthly portfolio positions for Spark, Grove, Obex, Keel, Osero, and Skybase. Styled after [soterlabs/msc-dashboard](https://github.com/soterlabs/msc-dashboard).

## Reporting views

Each prime has a shareable page at `/primes/{prime}`. The root opens Spark. Three scope tabs are available:

- **Individual prime** — prime-agent reporting, with entity attribution pending confirmation.
- **Prime group** — intended consolidation of a prime and its controlled entities; membership, ownership and eliminations remain TBD.
- **Combined primes** — all prime agents at `/combined`; combined totals remain TBD pending reporting scope and inter-prime eliminations. Sky's own income and expenses are outside this dashboard.

Each scope has an **Income statement** and **Portfolio positions** view. There are no daily-revenue or Sky-wide income screens.

Income statements have January–December columns and YTD for an incomplete year, FY for a completed year. Expandable rows follow the requested Spark spreadsheet structure. The spreadsheet supplies presentation only: none of its sample amounts, principal balances or loan terms are used. Other primes use a common financial statement structure. Supporting allocation income is shown separately from the draft statement, without inventing classifications or totals.

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

## Reporting API documentation

The authoritative guide in settlement-cycle is [`docs/pipeline/settlement-reporting-api.md`](https://github.com/soterlabs/settlement-cycle/blob/main/docs/pipeline/settlement-reporting-api.md).

Only reporting data is consumed, server-side:

- `/v2/reporting/{prime}/latest` for the latest publication in an incomplete current month.
- `/v2/reporting/{prime}/at/{cutoff}` for exact historical month ends.
- `/v3/reporting/statements` and `/v3/reporting/portfolio` for approved financial components and tracked allocation aggregates.

`REPORTING_API_URL` defaults to `https://settle-api-production.up.railway.app`. No API key is currently required. Requests read stored publications and cannot start calculations. There are no settlement, blockchain or database dependencies. Spark’s approved provisional 2026 expenses additionally use a versioned local JSON snapshot; the application does not read spreadsheets at runtime.

Successful responses are validated and cached for five minutes. Failed refreshes may retain the last checked response for that exact request with a visible warning. The bounded process-local cache clears on restart. Annual source reads have at most four upstream requests in flight per prime. Combined positions read each prime independently; their dates and revisions remain separate.

## Accounting and missing data

- Statements are draft, provisional and unaudited. They are not completed IFRS/US GAAP financial statements or pro forma adjusted statements.
- All unsupported statement figures and subtotals are **TBD**. The API currently lacks a complete income-statement classification, operating expenses, tax, legal-entity ownership and elimination inputs. Existing venue income is not automatically whole-venue gross interest income. The UI does not fill statement lines by guessing from venue labels.
- Net interest income means interest income less interest expense. Total net revenue means net interest income plus noninterest income. Income before tax deducts noninterest expenses and applicable consolidation adjustments. Tax and net income are separate; no zero tax is assumed.
- Missing/null values are TBD, never zero. A known zero remains zero. Future months are explicitly marked and are not forecasts. YTD/FY calculations require every elapsed month; no annualisation or partial subtotal is inferred.
- Current-month schedules use the latest publication only if its cutoff belongs to the selected month and is a completed UTC day. Its actual cutoff and delayed-publication status are visible. Historical months require the exact closing date; an incomplete publication is never substituted for a month end.
- Monthly income is the API's month-to-date figure, not a sum of daily MTD snapshots. Opening and closing position values are used directly.
- Reported position values are API valuations, not accounting carrying amounts under an approved measurement policy. Interest receivable and income received in advance are disclosed separately for supported loan methods. Receivables must not be added to a closing position that already includes them.
- Available `loan_accrual` income and the explicitly approved Obex V1 net vault income from v3 are presented as accrual-basis income. Other source income is explicitly labelled reported income with an unconfirmed basis. These two views are not additive.
- Portfolios, savings holdings and incentive claims can overlap. No cross-allocation or cross-prime sum is presented as consolidated portfolio value or revenue. Group and combined screens show source positions explicitly before consolidation.
- CSV exports follow the selected scope and view. Source exports preserve decimal precision, actual cutoff, revision IDs, hashes and publication timestamps. UI amounts are rounded to whole dollars using decimal arithmetic.

## First financial slice

Individual statements read `/v3/reporting/statements`: AR and Sky funding components
for each prime, plus Obex Maple syrupUSDC net investment income after embedded
vault fees. The broad parent lines remain TBD. Gross funding and its reimbursement
are the bridge to net funding, not additional expenses to add to net funding.

The Obex positions page reads `/v3/reporting/portfolio` for a one-position tracked
allocation aggregate and approved accrued income, matched to the same saved source
revision as its venue rows. This is not entity assets or NAV. Additional unreviewed
positions make the aggregate partial; the known portion is labelled separately.

Statement CSV downloads pin the exact annual selection returned for the screen,
including missing months, and preserve raw decimals and source metadata. Retained
statement month and YTD labels follow the saved API period when the calendar advances.
Individual positions CSVs pin both venue and financial revisions (including missing
publications), include the tracked aggregate as a separate `portfolio_summary` record,
and label member records `position`. Do not add summary records to their members.
Financial source hashes, policy, cutoff, refresh status and partial known values are
included alongside the original venue metadata. Missing
history keeps YTD unavailable. Backend policy and API details:
[financial API guide](https://github.com/soterlabs/settlement-cycle/blob/docs/reporting-dashboard-financial-api-prd/docs/pipeline/financial-reporting-api.md).

## Pending inputs

1. Entity attribution for each prime; group memberships, ownership and consolidation policies.
2. A non-overlapping allocation map and income classification, including interest, protocol fees, curator fees, rewards and investment gains/losses.
3. Demand-side rewards, funding interest, operating expenses, incentive costs, distribution costs, credit impairment and tax through the reporting API.
4. Confirmed loan terms and receipt classifications for unavailable accrual methods.

## Railway

`.railway/railway.ts` defines the Railpack build, start command and health check. Apply infrastructure changes with `railway config plan` followed by `railway config apply`. Pushes to `main` deploy automatically. Next.js uses Railway's supplied `PORT`. `/api/health` checks application readiness independently of financial-data availability.


## Allocation coverage (policy v2)

The dashboard accepts retained `prime-management.first-slice.v1` documents and
current `prime-management.allocations.v2` documents. Reviewed Spark/Grove/Osero
lending and vault leaves populate the statement's applicable families. Native
income is separated from external lending rewards received, and issuer
compensation has explicitly typed accrual/receipt recognition. Broader parent
totals and net investment yield remain unavailable until their coverage is approved.

Reviewed v3 members can supply the positions table and export even if a legacy
source has no v2 venue view. They retain their financial source revision and
metrics; missing v2 view hashes, unclassified cash and interest receivables are
not invented. Issuer receivables/advances remain distinct from interest balances
and are excluded from the tracked investment aggregate.

Backend coverage, membership, exclusions and policy-upgrade guide:
[allocation reporting](https://github.com/soterlabs/settlement-cycle/blob/feat/reporting-allocation-families/docs/pipeline/financial-allocation-reporting.md).


Review correction v2.1 preserves retained v1/v2 reports and fixes legacy issuer
source references. The dashboard accepts all supported policy versions before
the API changes its default. Position exports include each row's actual cutoff,
source venue ID and approved position ID, so vault redeployments with the same
business label can be reconciled independently. Summary rows have no member ID.

## Published monthly headlines

The `prime-management.monthly-statements.v3` annual statement adds published
Distribution Rewards, demand-side revenue and historical AR/net Sky funding.
The API bundles reviewed settlement summaries; the dashboard does not request
or sum daily revenue to fill historical months. January–September 2026 is
available for five primes; Osero's source history starts in July. Unsupported
historical allocation figures and unfinalized DR/demand-side MTD remain TBD.
GAR appears only for Skybase in the dashboard and CSV. Source summaries without
an explicit GAR row leave that amount unavailable.

A month can carry both a daily financial revision and a monthly-summary revision.
Available cells reference their own source in the manifest; CSVs preserve those
references as well as the frozen annual selection. This preserves existing
September allocation figures when headline fields use the published summary.
The monthly API policy and source snapshot are documented in the
[financial reporting API guide](https://github.com/soterlabs/settlement-cycle/blob/main/docs/pipeline/financial-reporting-api.md#published-monthly-history-monthly-statementsv3).

Deploy this compatible dashboard consumer before the backend switches its default
annual statement policy. Both retained v1/v2/v2.1 selections and the new monthly
statement are supported. Portfolio API policies are unchanged.

## Simplified statement presentation

Statements open with all expandable groups collapsed. Income statements select
a year; portfolio positions retain a reporting-month selector. Only individual
primes are offered: old combined/group pages redirect to an individual prime
while preserving the requested year/view/month. Old combined/group CSV requests
return HTTP 410 rather than silently exporting a different scope.

The statement and CSV omit pre-tax income, the tax row, credit impairment and
the gross-funding/spread-reimbursement breakdown. Net Sky funding remains visible.
Removing a row does not assume that its expense is zero.

`prime-management.statement-rollups.v3.1` binds parent lines to explicit API sums.
Reviewed families can have complete numeric subtotals; broader totals retain
unknown perimeter/expense inputs and show **Partial**, with their known component
amount separately labelled. A partial net-income amount is not confirmed profit.
The screen does no independent arithmetic. CSVs preserve coverage, exact known
amounts, missing-input explanations and all contributing source references.
The API retains old report selections and gross/reimbursement reconciliation data.

This PR is stacked on the monthly-headline dashboard PR; its API companion adds
the rollup policy without changing settlement calculations or daily publications.

## Grove STAC / JAAA history

The compatible `prime-management.rwa-income.v3.2` statement adds reviewed STAC
and JAAA investment-return rows and an RWA-family subtotal for Grove. It fills
every month from January through the latest published October source in the
same backend slice; historical/monthly precision and dated prime/Sky splits
remain explicit. Other missing income categories can still keep broader totals
partial. The current verified cutoff is October 27, not an invented October 28.

Grove labels this bucket Investment income from allocations and Net investment
income after funding: fund NAV appreciation is not labelled contractual interest.
The CSV uses the same exact API amounts and source references as the screen.
Old reporting policies and saved selections remain supported. This consumer
must deploy before the backend changes its default policy. Neither PR alone
publishes these values before its normal reviewed deployment.

Live reporting pages refresh every 30 seconds while visible, and when the tab
regains focus or connectivity. Live API reads bypass the pinned-export cache;
a failed refresh retains the last validated response. Filters and expanded rows
stay in place as newly published amounts replace TBD cells. Saved export
revision selections remain immutable.


## Spark 2026 provisional expenses

`src/lib/data/spark-expenses-2026.v1.json` contains only the Spark sheet's expense
rows 6–27 and 2026 columns from the supplied `prime_expenses.xlsx`. The original
workbook is not committed or required at runtime. Workbook SHA256, source rows
and snapshot revision identify the data. Staff-function and external-service
breakdowns are retained in the expandable hierarchy.

Every imported amount remains provisional/orange, including reported but
unverified actuals. Operating-expense basis is recorded by month: January–March
estimates, April–June reported actuals, July–September budgets, and October's
30% reduction scenario. November–December are blank, never extrapolated.
Memo, cash-check and estimation-input rows, grants/investments and the Savings
interest already included in funding costs are excluded.

Expense parents are calculated from disjoint children and checked against
workbook subtotal controls (rounding tolerance: one cent). Calendar-month
expenses are shown only after that month's end; an older MTD selection never
receives the subsequent full-month amount. Operational dashboard net income is
API net revenue less the scoped workbook expenses, requiring complete expense
data for the month. Annual net income sums matching monthly pairs rather than
subtracting annual totals with different coverage. Missing costs never become
zero. The API's tax/entity-adjustment placeholders are not replaced or claimed
as confirmed zeroes.

The validated API input and its hash/selection remain unchanged. Local display
lines and their composition have separate expense revisions and display hashes;
source details and CSV identify both inputs. New statement-download URLs pin
`financial_revision`, `expense_revision`, `expense_as_of` and the display hash; `financial_revision=none`
explicitly freezes unavailable API revenue. Legacy saved API-only export URLs
remain API-only. Retain immutable snapshot files and their registry entries when
adding a newer revision, so earlier exports remain reproducible. Unknown expense
revisions or mismatched display hashes fail instead of silently exporting changed figures. Other primes,
years, portfolio views and API publications are unaffected.

Full-month expense rows remain available when a revenue publication is delayed; net income stays TBD if that revenue cutoff stops before month end.


## Spark cash flow workbook preview

Spark's **Cash Flow Statement** tab (`view=cash-flow`) uses a versioned local
snapshot of `prime_reporting_framework.xlsx`, sheet `Cash Flow Statement - Spark`.
It presents the January–October 2026 operating, investing and financing rows,
with expandable adjustment details and a separate collapsed reconciliation table.
Every figure is provisional/orange; these workbook values are independent of the
current income statement and are not live API/onchain data. Workbook cash
reconciliation has unresolved gaps.

`src/lib/data/spark-cash-flow-2026.v1.json` preserves source rows, cached monthly
values, source total controls, cash definition and workbook SHA256. Blank inputs
remain TBD. Formula zeroes and carried balances beyond October are outside source
coverage and are not displayed as observations. Future periods remain dashes.
YTD flow values sum known covered months; opening cash takes the first balance,
and closing/measured/cumulative balances require the closing covered month.
Missing boundary balances stay TBD instead of falling back to another month.
Cached workbook subtotals are displayed as supplied, even when their underlying
inputs are incomplete; metrics and CSV preserve partial coverage and missing
inputs, and tooltips disclose this limitation. Snapshot validation checks scope,
identities, hierarchy, month values and workbook total controls.

Page and Cash flow CSV use the same local metrics. CSV selects the immutable
`cash_flow_revision` and completed-day `cash_flow_as_of`, preserving period
labels when the calendar advances. Invalid/future cutoffs or missing dates for
pinned exports fail explicitly. Unknown revisions fail, and unsupported prime/year exports
return 404. This view performs no reporting API reads. Other prime tabs and
historical years do not inherit Spark's workbook figures. Replacing these
snapshot values with independently observed chain data is a later step.

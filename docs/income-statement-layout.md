# Income statement layout

`statement-layout.ts` defines stable row identities and parent relationships.
Spark follows the approved sheet; Grove's catalog follows its September 2026
settlement venues and reviewed archive mappings. Grove's STAC, JAAA, GACLO and
other RWA funds appear as RWA vaults. Obex uses Maple and Osero uses SparkLend;
Keel and Skybase receive venue rows when their reporting API supplies them.

The catalog contains labels and income metric IDs, never financial amounts.
Some IDs reserve unsupported rows for future API mappings. These remain TBD.
Anchorage loan terms are pending confirmation; the illustrative sheet's
principal amounts and maturity dates are not treated as verified terms.

Parent relationships determine row depth, display order and collapse behavior.
The label column reserves a chevron gutter for both parents and leaves. New
API rows start collapsed. Confirmed zero gain filtering and Skybase-only GAR
remain in `prime-reports.ts`; Spark retains the SparkLend fees label.

`statement-values.ts` resolves published metrics. For rows with `sources`, it
sums disjoint published income metrics into a **dashboard presentation subtotal**.
These sums retain missing components, recognition, estimates and source refs;
unknown values never become zero. Negative values and full decimal precision
are preserved. Reclassification does not mutate the API report or its hash.

API statement totals remain authoritative. In particular, Savings funding
costs and unsupported native returns need API work before they can contribute
new amounts to the income statement. A displayed placeholder is not a claim
that its value is included in the published headline total.

CSV exports use the same resolver and order. Row ID, parent ID and depth encode
the hierarchy. Subtotal derivation and source metric IDs distinguish dashboard
sums from API metrics; the financial hash identifies the original API input.

The approved sheet contains filler amounts only. None are used in the catalog.

Spark also has Uniswap v4 (PYUSD/USDS, USDT/USDS, RLUSD/USDS) and Curve
(sUSDS/USDT, PYUSD/USDS) families. The v3.7 API supplies capital-adjusted,
Spark-retained LP returns; earlier policies show TBD. RLUSD issuer incentives
stay in the separate RLUSD revenue row. Unreconciled v4 trading fees make the
known position returns partial estimates, so those numbers retain estimate
coloring. Confirmed 100% Sky allocations contribute zero Spark SDE-eligible
return. The Curve sUSDS leg's embedded yield is outside that split and remains
LP revenue; periods with capital movements retain the source's estimated basis.

For Spark policy v3.8, `statement_rows` from the reporting API replaces the local
catalog and dashboard subtotals. Every numeric row resolves `metric_id` directly
to an API line; labels, nesting and values have one owner. Older policies and
other primes retain the local layout. Spark's verified aggregate Anchorage
interest receipts replace the three unconfirmed illustrative loans.

Zero-row filtering uses unrounded, fully available values over elapsed months.
TBD or partial cells keep the row, and parents remain if a child is visible.
Dollar amounts display with no decimals and rounded negative zero displays as
$0. API and CSV amounts retain full calculation precision.

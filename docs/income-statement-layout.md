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

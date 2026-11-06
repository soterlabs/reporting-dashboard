import type { Month } from "@/lib/prime-reports";

export function StatementTableHeader({ months, label, totalLabel, totalsThrough }: {
  months: Month[]; label: string; totalLabel: string; totalsThrough?: string;
}) {
  return <thead><tr>
    <th scope="col" aria-label={label} />
    {months.map(month => <th scope="col" key={month.key}>
      {month.label} {month.key.slice(0, 4)}
      <small className="statement-month-note" aria-hidden={month.state !== "partial"}>
        {month.state === "partial" ? "MTD" : "\u00a0"}
      </small>
    </th>)}
    <th scope="col" className="year-total" title={totalsThrough ? `Through ${totalsThrough}; monthly cells include newer API data when available.` : undefined}>
      {totalLabel}<small className="statement-month-note" aria-hidden="true">{"\u00a0"}</small>
    </th>
  </tr></thead>;
}

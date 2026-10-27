import { allReports, history } from "@/lib/api";
import {
  accruedIncome,
  amount,
  dailyChange,
  loanIncomeBalances,
  period,
  PRIMES,
  type Prime,
} from "@/lib/reporting";

export const dynamic = "force-dynamic";
function csvCell(value: unknown) {
  const text = String(value ?? "TBD");
  // Prevent spreadsheet formula evaluation in source-provided labels.
  const safe = /^[=+@\t\r]/.test(text) || /^-\D/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const { month, start, cutoff } = period(query.get("month") || undefined);
  const prime = PRIMES.includes(query.get("prime") as Prime)
    ? (query.get("prime") as Prime)
    : "all";
  const tab = query.get("tab");
  const rows: unknown[][] = [];
  if (tab === "sky") {
    rows.push([
      "Statement",
      "Period start",
      "Cutoff",
      "Line item",
      "USD",
      "Basis",
    ]);
    for (const line of [
      "Prime-agent investment income",
      "Other Sky income",
      "Consolidation adjustments",
      "Total income",
      "Interest expense",
      "Agent fees and incentives",
      "Operating expenses",
      "Credit impairment expense",
      "Income before tax",
    ])
      rows.push([
        "Sky consolidated",
        start,
        cutoff,
        line,
        "TBD",
        "Draft accrual statement; reporting API does not provide consolidated totals",
      ]);
  } else if (tab === "daily" && prime !== "all") {
    const h = await history(prime, start, cutoff);
    const id = query.get("allocation");
    rows.push([
      "Prime agent",
      "Date UTC",
      "Allocation",
      "Change in reported income USD",
      "Investment income (accrual basis) USD",
      "Reported position value USD",
      "Revision",
      "Previous revision",
      "View hash",
      "Computed at",
      "History API checked at",
      "Refresh status",
      "Accounting basis",
    ]);
    for (let i = 1; i <= Number(cutoff.slice(8)); i++) {
      const day = `${month}-${String(i).padStart(2, "0")}`;
      const current = h.publications.find((p) => p.cutoff === day);
      const previous = h.publications.find(
        (p) => p.cutoff === `${month}-${String(i - 1).padStart(2, "0")}`,
      );
      const row = current?.result.venues.find((v) => v.venue_id === id);
      rows.push([
        prime,
        day,
        row?.label ?? id ?? "TBD",
        id ? dailyChange(current, previous, id) : null,
        id ? dailyChange(current, previous, id, true) : null,
        row ? amount(row, "position_value_usd") : null,
        current?.revision_id,
        previous?.revision_id,
        current?.view_hash,
        current?.computed_at,
        h.verifiedAt,
        h.message || "API response checked",
        "Latest revision per date; reported movement includes revisions; accrual only where confirmed",
      ]);
    }
  } else {
    const data = await allReports(cutoff);
    rows.push([
      "Prime agent",
      "Cutoff",
      "Allocation",
      "Reported position value USD",
      "Reported investment income MTD USD",
      "Investment income (accrual basis) MTD USD",
      "Interest receivable USD",
      "Income received in advance USD",
      "Known cash income MTD USD",
      "Interest expense USD",
      "Net investment yield",
      "Recognition method",
      "Status",
      "Reason",
      "Revision",
      "View hash",
      "Source result hash",
      "Computed at",
      "API checked at",
      "Refresh status",
      "Excluded inputs",
    ]);
    for (const p of prime === "all" ? PRIMES : [prime]) {
      const { report, message, verifiedAt } = data[p];
      const venues = report?.data.result.venues.filter((v) => v.enabled) || [];
      if (!venues.length)
        rows.push([
          p,
          cutoff,
          "TBD",
          "TBD",
          "TBD",
          "TBD",
          "TBD",
          "TBD",
          "TBD",
          "TBD",
          "TBD",
          "TBD",
          "TBD",
          message || "No reporting allocations",
          report?.data.revision_id,
          report?.data.view_hash,
          report?.data.source_result_hash,
          report?.data.computed_at,
          verifiedAt,
          message || "API response checked",
          report?.data.excluded_inputs.join("; "),
        ]);
      for (const v of venues)
        rows.push([
          p,
          cutoff,
          v.label,
          amount(v, "position_value_usd"),
          amount(v, "income_usd"),
          accruedIncome(v),
          loanIncomeBalances(v).interestReceivable,
          loanIncomeBalances(v).incomeReceivedInAdvance,
          amount(v, "cash_received_usd"),
          "TBD",
          "TBD",
          v.method,
          v.status,
          v.reason || "",
          report?.data.revision_id,
          report?.data.view_hash,
          report?.data.source_result_hash,
          report?.data.computed_at,
          verifiedAt,
          message || "API response checked",
          report?.data.excluded_inputs.join("; "),
        ]);
    }
  }
  return new Response(
    "\uFEFF" + rows.map((row) => row.map(csvCell).join(",")).join("\r\n"),
    {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="sky-${tab === "daily" ? "daily-income" : tab === "sky" ? "income-statement" : "portfolio"}-${month}.csv"`,
        "Cache-Control": "no-store",
      },
    },
  );
}

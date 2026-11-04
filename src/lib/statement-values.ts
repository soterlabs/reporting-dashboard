import Decimal from "decimal.js";
import {
  financialLine,
  metricAmount,
  type FinancialStatement,
  type Metric,
} from "./financial.ts";
import { numberConfidence, statementUncertainty } from "./number-confidence.ts";
import type { StatementLine } from "./prime-reports.ts";
const SumDecimal = Decimal.clone({ precision: 100 });

// View subtotals reorganize existing API income only. They never change the
// retained document, its hash/selection, or its authoritative statement totals.
export function statementFinancialLine(
  report: FinancialStatement | null | undefined,
  row: StatementLine,
): FinancialStatement["lines"][number] | undefined {
  if (!report) return undefined;
  if (row.metricId) return report.lines.find((l) => l.id === row.metricId);
  if (!row.sources) return financialLine(report, row.id);
  const sources = [...new Set(row.sources)];
  function combine(month?: string): Metric {
    const cells = sources.map((id) => {
      const r = financialLine(report, id);
      return month ? r?.values[month] : r?.total;
    });
    const known = cells.filter((c) => metricAmount(c) !== null);
    const complete =
      cells.length > 0 &&
      cells.every((c) => c?.status === "available" && c.value !== null);
    const sum = known
      .reduce((s, c) => s.plus(metricAmount(c)!), new SumDecimal(0))
      .toString();
    const recognition = [...new Set(known.map((c) => c!.recognition))];
    const future =
      month && report!.periods.find((p) => p.key === month)?.state === "future";
    const cutoffs = month
      ? known
          .map(
            (c) =>
              c!.period_end ||
              report!.periods.find((p) => p.key === month)?.actual_cutoff,
          )
          .filter((v): v is string => !!v)
      : [];
    return {
      ...(month && cutoffs.length === known.length && cutoffs.length
        ? { period_start: month + "-01", period_end: cutoffs.sort()[0] }
        : {}),
      unit: "USD",
      value: !future && complete ? sum : null,
      known_value: !future && !complete && known.length ? sum : null,
      status: future
        ? "future"
        : complete
          ? "available"
          : known.length
            ? "partial"
            : "unavailable",
      recognition: recognition.length === 1 ? recognition[0] : "unknown",
      basis: "dashboard_sum_of_published_income_metrics",
      reason: complete ? null : "displayed_components_not_fully_published",
      source_paths: [...new Set(known.flatMap((c) => c!.source_paths))],
      source_refs: [
        ...new Set(
          known.flatMap((c) => [
            ...(c!.source_refs || []),
            ...(c!.source_ref ? [c!.source_ref] : []),
          ]),
        ),
      ],
      component_ids: sources,
      missing_components: sources.filter(
        (_, i) => cells[i]?.status !== "available" || cells[i]?.value === null,
      ),
      ...(known.some((c) => c!.quality === "estimate")
        ? { quality: "estimate" as const }
        : {}),
    };
  }
  return {
    id: row.id,
    label: row.label,
    aggregation: "subtotal",
    components: sources.map((id) => ({ id, sign: 1 })),
    values: Object.fromEntries(
      report.periods.map((p) => [p.key, combine(p.key)]),
    ),
    total: combine(),
  };
}

export function statementRowUncertainty(
  report: FinancialStatement | null | undefined,
  row: StatementLine,
  month?: string,
  retained = false,
) {
  if (row.sources) {
    for (const id of row.sources) {
      const reason = statementUncertainty(
        report,
        financialLine(report, id)?.id || id,
        month,
        retained,
      );
      if (reason) return reason;
      const source = financialLine(report, id);
      const cell = month ? source?.values[month] : source?.total;
      if (
        metricAmount(cell) !== null &&
        numberConfidence(metricAmount(cell), cell).tone === "uncertain"
      )
        return "Contains amounts with uncertain coverage or income basis";
    }
  }
  return statementUncertainty(
    report,
    row.metricId || financialLine(report, row.id)?.id || row.id,
    month,
    retained,
  );
}

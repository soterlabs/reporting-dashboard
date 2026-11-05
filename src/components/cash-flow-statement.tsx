"use client";
import { useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cashFlowSnapshot, cashFlowLayout, cashFlowMetric, type CashFlowRow } from "@/lib/cash-flow";
import { collapsedStatementGroups, type Month } from "@/lib/prime-reports";
import { visibleStatementLines } from "@/lib/statement-layout";
import { FinancialNumber } from "./financial-number";

export function CashFlowStatement({ year, months }: { year: number; months: Month[] }) {
  const rows = cashFlowLayout(), groups = collapsedStatementGroups(rows);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  if (year !== cashFlowSnapshot.year) return <section className="panel"><div className="panel-heading"><h2>Spark cash flow statement</h2></div><p className="panel-note">No workbook data for {year}. The current snapshot covers January–October 2026.</p></section>;
  const collapsed = new Set([...groups].filter(id => !expanded.has(id)));
  function toggle(id: string) { setExpanded(current => { const next = new Set(current); if(next.has(id)) next.delete(id); else next.add(id); return next; }); }
  function table(checks = false) {
    const layout = checks ? cashFlowLayout(true) : visibleStatementLines(rows, collapsed);
    const number = (row: CashFlowRow, month?: string) => { const metric = cashFlowMetric(row, months, month); return <FinancialNumber value={metric.value} evidence={metric} detail={metric.source_paths[0]} uncertainReason="Provisional workbook figure; reconciliation gaps unresolved" />; };
    return <div className="table-wrap financial-wrap" tabIndex={0} role="region" aria-label={checks ? "Cash flow reconciliation" : "Spark annual cash flow statement; scroll horizontally for all months"}>
      <table className="financial-table"><thead><tr><th scope="col">Line item</th>{months.map(m => <th scope="col" key={m.key}>{m.label} {year}</th>)}<th scope="col" className="year-total">YTD</th></tr></thead>
      <tbody>{layout.map(row => { const source = cashFlowSnapshot.rows.find(r => r.id === row.id)!; return <tr key={row.id} data-row-id={row.id} data-depth={row.level} className={row.kind || (groups.has(row.id) ? "group" : "")}>
        <th scope="row" style={{ "--statement-depth": row.level } as CSSProperties}>{groups.has(row.id) ? <button className="row-toggle statement-label" aria-expanded={expanded.has(row.id)} onClick={() => toggle(row.id)}>{expanded.has(row.id) ? <ChevronDown size={13} /> : <ChevronRight size={13} />}<span>{row.label}</span></button> : <span className="statement-label"><span className="row-toggle-spacer" aria-hidden="true" /><span>{row.label}</span></span>}</th>
        {months.map(m => <td key={m.key}>{row.kind !== "section" && number(source,m.key)}</td>)}<td className="year-total">{row.kind !== "section" && number(source)}</td></tr>; })}</tbody></table></div>;
  }
  return <>
    <section className="panel"><div className="panel-heading"><div><h2>Spark cash flow statement</h2><p>USD · January–October 2026 · Provisional workbook snapshot</p><p className="statement-help">TBD = missing data. Figures are independent of the current income statement; reconciliation gaps remain.</p></div><button className="button" onClick={() => setExpanded(collapsed.size ? new Set(groups) : new Set())}>{collapsed.size ? "Expand all" : "Collapse all"}</button></div>{table()}</section>
    <details className="panel source-coverage"><summary className="panel-heading"><h2>Cash reconciliation</h2></summary>{table(true)}<p className="panel-note">Beginning and ending statement balances are workbook roll-forwards. Measured cash is a separate workbook check, with unresolved differences.</p></details>
    <details className="source-details"><summary>Workbook source & cash definition</summary><div className="source-body"><p>{cashFlowSnapshot.source.file} · {cashFlowSnapshot.source.sheet}</p><p>{cashFlowSnapshot.cash_definition}</p><p>Statement and reconciliation figures are copied from the workbook. Formula subtotals may include blank inputs; a number does not establish complete coverage. Unreported months remain TBD; future months are not forecasts. All imported numbers remain provisional/orange.</p><p>Snapshot: {cashFlowSnapshot.id}</p><p>Workbook SHA256: {cashFlowSnapshot.source.sha256}</p></div></details>
  </>;
}

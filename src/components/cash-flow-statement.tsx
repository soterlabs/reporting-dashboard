"use client";
import { statementDisplayLabel } from "@/lib/statement-labels";
import { useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cashFlowLayout } from "@/lib/cash-flow";
import type { CashFlowReport } from "@/lib/cash-flow-api";
import { collapsedStatementGroups, type Month, type StatementLine } from "@/lib/prime-reports";
import { visibleStatementLines } from "@/lib/statement-layout";
import { metricAmount } from "@/lib/financial";
import { CashFlowReconciliation } from "./cash-flow-reconciliation";
import type { FinancialStatement } from "@/lib/financial";
import { name, type Prime } from "@/lib/reporting";
import { FinancialNumber } from "./financial-number";
import { StatementSectionRow } from "./statement-section-row";

export function CashFlowStatement({ prime, year, month, months, report, financial, retained = false, message, reconciliationOnly = false }: {
  prime: Prime; year: number; month: string; financial?: FinancialStatement | null; months: Month[]; report?: CashFlowReport | null; retained?: boolean; message?: string | null; reconciliationOnly?: boolean;
}) {
  const layout: StatementLine[] = report ? report.lines.map(r=>({id:r.id,label:statementDisplayLabel(r.id,r.label),parent:r.parent || undefined,level:r.depth,kind:r.kind || undefined})) : [...cashFlowLayout(),...cashFlowLayout(true)].map(row=>({...row,label:statementDisplayLabel(row.id,row.label)}));
  const checkIds = new Set(report ? report.lines.filter(r=>r.check).map(r=>r.id) : cashFlowLayout(true).map(r=>r.id));
  const rows=layout.filter(r=>!checkIds.has(r.id)), groups=collapsedStatementGroups(rows);
  const [expanded,setExpanded]=useState<Set<string>>(()=>new Set());
  const title=name(prime);
  const calendar=months.map(m=>{const p=report?.periods.find(p=>p.key===m.key);return p ? {...m,state:p.state,cutoff:p.actual_cutoff} : m;});
  const collapsed=new Set([...groups].filter(id=>!expanded.has(id)));
  function toggle(id:string){setExpanded(current=>{const next=new Set(current);if(next.has(id))next.delete(id);else next.add(id);return next;});}
  function table(checks=false){
    const visible=checks ? layout.filter(r=>checkIds.has(r.id)) : visibleStatementLines(rows,collapsed);
    function number(id:string,month?:string){
      const line=report?.lines.find(r=>r.id===id),cell=month ? line?.values[month] : line?.total;
      const p=report?.periods.find(p=>p.key===month),future=month ? calendar.find(m=>m.key===month)?.state==="future" : false;
      return <FinancialNumber value={metricAmount(cell)} evidence={cell} future={future} detail={[cell?.reason,...(cell?.source_paths || [])].filter(Boolean).join(" · ")} uncertainReason={retained ? "Refresh failed; retained cash-flow publication" : p?.stale ? "Delayed cash-flow publication" : undefined} />;
    }
    return <div className="table-wrap financial-wrap" tabIndex={0} role="region" aria-label={checks ? "Cash flow reconciliation" : `${title} annual cash flow statement; scroll horizontally for all months`}>
      <table className="financial-table"><thead><tr><th scope="col" aria-label="Cash flow statement categories and items" />{calendar.map(m=><th scope="col" key={m.key}>{m.label} {year}{m.state==="partial" && <small>MTD</small>}</th>)}<th scope="col" className="year-total">{calendar.every(m=>m.state==="complete") ? "FY" : "YTD"}</th></tr></thead>
      <tbody>{visible.map(row=>row.kind==="section" ? <StatementSectionRow key={row.id} id={row.id} depth={row.level} columns={calendar.length+2}>
        {groups.has(row.id) ? <button className="row-toggle statement-label" aria-expanded={expanded.has(row.id)} onClick={()=>toggle(row.id)}>{expanded.has(row.id) ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}<span>{row.label}</span></button> : row.label}
      </StatementSectionRow> : <tr key={row.id} data-row-id={row.id} data-depth={row.level} className={row.kind || (groups.has(row.id) ? "group" : "")}>
        <th scope="row" style={{"--statement-depth":row.level} as CSSProperties}>{groups.has(row.id) ? <button className="row-toggle statement-label" aria-expanded={expanded.has(row.id)} onClick={()=>toggle(row.id)}>{expanded.has(row.id) ? <ChevronDown size={13}/> : <ChevronRight size={13}/>}<span>{row.label}</span></button> : <span className="statement-label"><span className="row-toggle-spacer" aria-hidden="true"/><span>{row.label}</span></span>}</th>
        {calendar.map(m=><td key={m.key}>{number(row.id,m.key)}</td>)}<td className="year-total">{number(row.id)}</td></tr>)}</tbody></table></div>;
  }
  const coverage=Object.entries(report?.monthly_coverage || {}).filter(([,v])=>v);
  const missing=[...new Set(coverage.flatMap(([,v])=>v!.missing_chains))];
  if (reconciliationOnly) return report ? (
    <details open className="panel source-coverage"><summary className="panel-heading"><h2>Cash reconciliation</h2></summary>{table(true)}<p className="panel-note">Balances are independently measured. Unclassified movements and incomplete bridge or principal/interest attribution remain explicit.</p></details>
  ) : (
    <section className="panel"><div className="panel-heading"><h2>Cash reconciliation</h2></div><p className="panel-note">{message || "Event-backed cash reconciliation is not yet available for this prime and year."}</p></section>
  );
  return <>
    <section className="panel"><div className="panel-heading"><div><h2 className="statement-title">{title} cash flow statement</h2></div><button className="button" onClick={()=>setExpanded(collapsed.size ? new Set(groups) : new Set())}>{collapsed.size ? "Expand all" : "Collapse all"}</button></div>{(report || (prime === "spark" && year === 2026)) && table()}<p className="panel-note">{message || (report ? "Cash movements use actual transaction dates. Net income retains the reporting income and expense basis." : "Event-backed cash-flow data is not yet available for this prime and year; workbook amounts are not substituted.")}</p></section>
    <CashFlowReconciliation key={`${prime}:${year}:${month}`} prime={prime} year={year} month={month} months={calendar} report={report} financial={financial} retained={retained} />
    <details hidden className="source-details"><summary>Sources & transaction evidence</summary><div className="source-body"><p>{report?.source_note || "No API publication selected."}</p>{missing.length>0 && <p>Missing chain coverage: {missing.join(", ")}.</p>}{report && <><p>As of: {report.as_of} · Report hash: {report.report_hash}</p>{report.periods.filter(p=>p.revision).map(p=><div className="source-row" key={p.key}><strong>{p.key} · {p.actual_cutoff}</strong><span>Revision: {p.revision}</span><a href={`/api/cash-flow/events?${new URLSearchParams({prime,month:p.key,revision:p.revision!})}`} target="_blank" rel="noreferrer">Transaction evidence</a><a href={`/api/cash-flow/balances?${new URLSearchParams({prime,month:p.key,revision:p.revision!})}`} target="_blank" rel="noreferrer">Balance evidence</a></div>)}</>}</div></details>
  </>;
}

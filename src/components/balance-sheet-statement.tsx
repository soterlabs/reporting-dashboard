"use client";
import {useState,type CSSProperties} from "react";
import {ChevronDown,ChevronRight} from "lucide-react";
import {balanceSheetRows} from "@/lib/balance-sheet";
import type {BalanceSheetReport} from "@/lib/balance-sheet-api";
import {metricAmount} from "@/lib/financial";
import {collapsedStatementGroups,type Month} from "@/lib/prime-reports";
import {visibleStatementLines} from "@/lib/statement-layout";
import {StatementTableHeader} from "./statement-table-header";
import {StatementSectionRow} from "./statement-section-row";
import {FinancialNumber} from "./financial-number";

export function BalanceSheetStatement({report,months,retained=false,message}:{report?:BalanceSheetReport|null;months:Month[];retained?:boolean;message?:string|null}){
 const rows=report?balanceSheetRows(report):[];
 const groups=collapsedStatementGroups(rows),[expanded,setExpanded]=useState<Set<string>>(()=>new Set());
 const collapsed=new Set([...groups].filter(id=>!expanded.has(id)));
 const calendar=months.map(m=>{const p=report?.periods.find(p=>p.key===m.key);return p?{...m,state:p.state,cutoff:p.actual_cutoff}:m;});
 function toggle(id:string){setExpanded(old=>{const next=new Set(old);if(next.has(id))next.delete(id);else next.add(id);return next;});}
 function number(id:string,month?:string){
  const line=report?.lines.find(l=>l.id===id),c=month?line?.values[month]:line?.total;
  const p=month?report?.periods.find(p=>p.key===month):report?.periods.filter(p=>p.state!=="future").at(-1);
  return <FinancialNumber value={metricAmount(c)} evidence={c} future={p?.state==="future"} uncertainReason={retained?"Retained balance sheet publication":p?.stale?"Delayed closing balance":undefined} detail={[c?.reason,p?.actual_cutoff?`As of ${p.actual_cutoff}`:null].filter(Boolean).join(" · ")}/>;
 }
 return <section className="panel statement-panel"><div className="panel-heading"><div><h2 className="statement-title">Spark balance sheet statement</h2></div>{report&&<button className="button" onClick={()=>setExpanded(collapsed.size?new Set(groups):new Set())}>{collapsed.size?"Expand all":"Collapse all"}</button>}</div>
 {report?<div className="table-wrap financial-wrap" tabIndex={0} role="region" aria-label="Spark annual balance sheet statement; scroll horizontally for all months"><table className="financial-table"><StatementTableHeader months={calendar} label="Balance sheet categories and items" totalLabel="Latest"/><tbody>
 {visibleStatementLines(rows,collapsed).map(row=>row.kind==="section"?<StatementSectionRow key={row.id} id={row.id} depth={row.level} columns={calendar.length+2}>{row.label}</StatementSectionRow>:<tr key={row.id} data-row-id={row.id} data-depth={row.level} className={row.kind||(groups.has(row.id)?"group":"")}><th scope="row" style={{"--statement-depth":row.level} as CSSProperties}>{groups.has(row.id)?<button className="row-toggle statement-label" aria-expanded={expanded.has(row.id)} onClick={()=>toggle(row.id)}>{expanded.has(row.id)?<ChevronDown size={13}/>:<ChevronRight size={13}/>}<span>{row.label}</span></button>:<span className="statement-label"><span className="row-toggle-spacer" aria-hidden="true"/><span>{row.label}</span></span>}</th>{calendar.map(m=><td key={m.key}>{number(row.id,m.key)}</td>)}<td className="year-total">{number(row.id)}</td></tr>)}
 </tbody></table></div>:<p className="panel-note">{message||"Balance sheet reporting is not yet available."}</p>}
 {report&&<p className="panel-note">Closing balances, including principal. Unsourced balances remain TBD. Latest shows the most recent period.</p>}
 </section>;
}

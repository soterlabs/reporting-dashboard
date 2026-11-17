import Decimal from "decimal.js";
import {marginLabels,marginText,type MarginReport,type MarginMetric,type MarginMonth} from "@/lib/margins";
import type {Month} from "@/lib/prime-reports";
import {StatementTableHeader} from "./statement-table-header";
import {StatementSectionRow} from "./statement-section-row";

const money=(c:MarginMetric|undefined)=>c?.status==="available" && c.value!==null ? new Decimal(c.value).toDecimalPlaces(2).toNumber().toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "TBD";
const amountLabels:Record<string,string>={investment_income:"Allocation income",funding_expense:"Funding expense (Sky + Savings)",net_interest:"Net investment income",other_income:"Other income",direct_expenses:"Direct expenses",user_incentives:"User incentives",operating_expenses:"Operating expenses",nrm_before_incentives:"Net revenue before incentives",nrm_after_incentives:"Net revenue after incentives",net_income:"Management net income"};

export function MarginsStatement({report,months,message,retained}:{report?:MarginReport|null;months:Month[];message?:string|null;retained?:boolean}){
 if(!report)return <section className="panel statement-panel"><p className="panel-note" role="status">{message || "Margins publication unavailable. No values are assumed."}</p></section>;
 const calendar=months.map(m=>({...m,state:(report.months.find(x=>x.month===m.key)?.period.state ?? m.state) as Month["state"]}));
 const latest=report.months.filter(m=>m.period.state!=="future").at(-1);
 function row(key:string,label:string,select:(m:MarginMonth)=>MarginMetric|undefined,format:(c:MarginMetric|undefined)=>string){
  function cell(m?:MarginMonth){
   const c=m?select(m):undefined;
   return <span title={c?.reason?.replaceAll("_"," ")||undefined}>{m?.period.state==="future"?"—":format(c)}</span>;
  }
  return <tr key={key}><th scope="row"><span className="statement-label"><span className="row-toggle-spacer" aria-hidden="true"/><span>{label}</span></span></th>{calendar.map(m=><td key={m.key}>{cell(report!.months.find(x=>x.month===m.key))}</td>)}<td className="year-total">{cell(latest)}</td></tr>;
 }
 function section(id:string,label:string){return <StatementSectionRow id={id} depth={0} columns={calendar.length+2}>{label}</StatementSectionRow>;}
 return <section className="panel statement-panel">
  <div className="panel-heading"><h2 className="statement-title">Spark margins</h2></div>
  {(retained||message)&&<p className="panel-note" role="status">{message || "Showing retained publication"}</p>}
  <p className="panel-note">Monthly returns, not annual APYs. Full-Spark income and funding costs use the reporting statement. Expense inputs remain provisional; TBD means a required input is missing.</p>
  <div className="table-wrap financial-wrap" tabIndex={0} role="region" aria-label="Spark margins statement; scroll horizontally for all months"><table className="financial-table">
   <StatementTableHeader months={calendar} label="Margin metrics and calculation inputs" totalLabel={latest?`Latest (${latest.month})`:"Latest"}/>
   <tbody>
    {section("margins","Full Spark · monthly margins")}
    {Object.entries(marginLabels).filter(([key])=>key!=="funding_rate").map(([key,label])=>row(key,label,m=>m.metrics[key],c=>marginText(c,key==="nis")))}
   </tbody>
  </table></div>
  <p className="panel-note">Latest uses the most recent non-future period, not a sum or average of monthly percentages. Expense inputs remain provisional.</p>
  <details><summary>Calculation inputs and covered allocations</summary>
   <p className="panel-note">Average cost of capital uses average allocated assets. NIS subtracts the funding rate, which uses average Sky debt plus Savings liabilities. Direct expenses are deducted in both NRM measures; NM also deducts operating expenses.</p>
   <div className="table-wrap financial-wrap" tabIndex={0} role="region" aria-label="Margin calculation inputs and covered allocations"><table className="financial-table"><StatementTableHeader months={calendar} label="Calculation inputs and covered allocations" totalLabel={latest?`Latest (${latest.month})`:"Latest"}/><tbody>
    {section("funding","Full Spark · funding rate")}
    {row("funding-rate",marginLabels.funding_rate,m=>m.metrics.funding_rate,marginText)}
    {section("covered","Covered allocations · monthly returns")}
    {row("covered-net","Income after Sky borrowing costs / assets",m=>m.allocation_slice.metrics.nim,marginText)}
    {row("covered-yield","Allocation yield",m=>m.allocation_slice.metrics.yield_,marginText)}
    {row("covered-cost","Sky borrowing costs / assets",m=>m.allocation_slice.metrics.cost_on_assets,marginText)}
    {row("coverage","Allocations included",m=>({value:String(m.allocation_slice.included_venues.length),status:m.allocation_slice.status==="unavailable"?"unavailable":"available",reason:null}),c=>c?.status==="available"?c.value!:"—")}
    {section("amounts","Full Spark · calculation inputs (USD)")}
    {Object.entries(amountLabels).map(([key,label])=>row(key,label,m=>m.numerators[key],money))}
   </tbody></table></div>
   <p className="panel-note">Covered allocations use matched income, average assets and modeled Sky borrowing costs; they exclude Savings interest and Prime-level adjustments. They are never substituted for the full portfolio.</p>
  </details>
  <details><summary>Coverage and source details</summary>
   {report.months.filter(m=>m.allocation_slice.included_venues.length>0).map(m=><p key={m.month} className="panel-note">{m.month}: {m.allocation_slice.included_venues.length} included ({m.allocation_slice.included_venues.join(", ")}). Excluded: {m.allocation_slice.excluded_venues.map(x=>`${x.venue}: ${x.reason.replaceAll("_"," ")}`).join("; ")||"none"}.</p>)}
   <p className="panel-note">Allocation-cost reconciliation remains deferred; no difference is redistributed. Full Spark amounts use statement funding expense.</p>
   <p className="panel-note">Statement: <code>{report.statement_report_hash}</code><br/>Expenses: <code>{report.expense_revision}</code><br/>Margins: <code>{report.report_hash}</code></p>
  </details>
 </section>;
}

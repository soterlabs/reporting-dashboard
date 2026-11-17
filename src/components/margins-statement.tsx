import Decimal from "decimal.js";
import {marginLabels,marginText,type MarginReport,type MarginMetric,type MarginMonth} from "@/lib/margins";
import type {Month} from "@/lib/prime-reports";
import {StatementTableHeader} from "./statement-table-header";

const money=(c:MarginMetric|undefined)=>c?.status==="available" && c.value!==null ? new Decimal(c.value).toDecimalPlaces(2).toNumber().toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "TBD";
const amountLabels:Record<string,string>={
 investment_income:"R — Allocation income",
 funding_expense:"C — Funding expense (Sky + Savings)",
 other_income:"O — Other income",
 direct_expenses:"D — Direct expenses",
 user_incentives:"I — User incentives",
 operating_expenses:"E — Operating expenses",
};
const formulas:Record<string,string>={
 allocation_yield:"R / A",
 cost_on_assets:"C / A",
 nis:"R / A − C / F",
 nim:"(R − C) / A",
 nrm_before_incentives:"(R + O − C − D) / A",
 nrm_after_incentives:"(R + O − C − D − I) / A",
 nm:"(R + O − C − D − I − E) / A",
};

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
 return <section className="panel statement-panel">
  <div className="panel-heading"><h2 className="statement-title">Spark margins</h2></div>
  {(retained||message)&&<p className="panel-note" role="status">{message || "Showing retained publication"}</p>}
  <p className="panel-note">Monthly, not annualized. Expenses are provisional; TBD means an input is missing.</p>
  <div className="table-wrap financial-wrap" tabIndex={0} role="region" aria-label="Spark margins statement; scroll horizontally for all months"><table className="financial-table">
   <StatementTableHeader months={calendar} label="Metric" totalLabel={latest?`Latest (${latest.month})`:"Latest"}/>
   <tbody>
    {Object.keys(formulas).map(key=>row(key,marginLabels[key],m=>m.metrics[key],c=>marginText(c,key==="nis")))}
   </tbody>
  </table></div>
  <section className="margin-formula-card" aria-label="Metric formulas">
   <h3>Formulas</h3>
   <table><thead><tr><th scope="col">Metric</th><th scope="col">Formula used</th></tr></thead>
    <tbody>{Object.entries(formulas).map(([key,formula])=><tr key={key}><th scope="row">{marginLabels[key]}</th><td>{formula}</td></tr>)}</tbody>
   </table>
  </section>
  <div className="table-wrap financial-wrap" tabIndex={0} role="region" aria-label="Monthly margin inputs in USD"><table className="financial-table">
   <StatementTableHeader months={calendar} label="Inputs (USD)" totalLabel={latest?`Latest (${latest.month})`:"Latest"}/>
   <tbody>
    {row("assets","A — Average allocated assets",m=>m.denominators.average_allocated_assets,money)}
    {row("funding","F — Average funding (Sky debt + Savings liabilities)",m=>m.denominators.average_funding,money)}
    {Object.entries(amountLabels).map(([key,label])=>row(key,label,m=>m.numerators[key],money))}
   </tbody>
  </table></div>
 </section>;
}

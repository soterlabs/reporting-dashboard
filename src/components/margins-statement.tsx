import Decimal from "decimal.js";
import {marginLabels,marginText,type MarginReport,type MarginMetric} from "@/lib/margins";
const money=(c:MarginMetric|undefined)=>c?.status==="available" && c.value!==null ? new Decimal(c.value).toDecimalPlaces(2).toNumber().toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}) : "TBD";
export function MarginsStatement({report,month,message,retained}:{report?:MarginReport|null;month:string;message?:string|null;retained?:boolean}){
 const m=report?.months.find(x=>x.month===month);
 if(!m)return <section className="notice" role="status">{message || "Margins publication unavailable. No values are assumed."}</section>;
 const labels:Record<string,string>={investment_income:"Allocation income",funding_expense:"Funding expense (Sky + Savings)",net_interest:"Net investment income",other_income:"Other income",direct_expenses:"Direct expenses",user_incentives:"User incentives",operating_expenses:"Operating expenses",nrm_before_incentives:"Net revenue before incentives",nrm_after_incentives:"Net revenue after incentives",net_income:"Management net income"};
 return <section>
  <h2>Spark margins · {month}</h2>
  <p>Monthly returns, not annual APYs. Same operational scope and income classification as the reporting income statement.</p>
  {(retained||message)&&<p role="status">{message || "Showing retained publication"}</p>}
  <div className="table-wrap"><table><thead><tr><th>Metric</th><th>Monthly result</th></tr></thead><tbody>{Object.entries(marginLabels).map(([k,label])=><tr key={k}><td>{label}</td><td title={m.metrics[k].reason||undefined}>{marginText(m.metrics[k],k==="nis")}</td></tr>)}</tbody></table></div>
  <p>TBD means required inputs are incomplete, not zero. Full Spark average assets and average debt must cover the same scope as statement income. Closing balances and original invested principal are not substituted.</p>
  <h3>Amounts used · USD</h3>
  <div className="table-wrap"><table><thead><tr><th>Component</th><th>Amount</th></tr></thead><tbody>{Object.entries(labels).map(([k,label])=><tr key={k}><td>{label}</td><td title={m.numerators[k]?.reason||undefined}>{money(m.numerators[k])}</td></tr>)}</tbody></table></div>
  <p>Expense inputs are provisional: {m.expense_basis?.replaceAll("_"," ")||"not supplied"}. Incentives and operating expenses are deducted once. NM is an asset-based management return, not an audited after-tax profit margin.</p>
  <h3>Covered allocation slice — separate diagnostic</h3>
  <p>{m.allocation_slice.included_venues.length} venues have matched income, average assets and modeled Sky costs. This narrower slice excludes Savings interest and Prime-level adjustments; it is not Spark’s overall margin.</p>
  <div className="table-wrap"><table><thead><tr><th>Metric</th><th>Monthly result</th></tr></thead><tbody>{[["yield_","Yield"],["cost_on_assets","Sky cost / assets"],["nim","Income after Sky costs / assets"]].map(([k,label])=><tr key={k}><td>{label}</td><td>{marginText(m.allocation_slice.metrics[k])}</td></tr>)}</tbody></table></div>
  <details><summary>Coverage and source details</summary><p>Included: {m.allocation_slice.included_venues.join(", ")||"none"}.</p><p>Excluded: {m.allocation_slice.excluded_venues.map(x=>`${x.venue}: ${x.reason.replaceAll("_"," ")}`).join("; ")||"none"}.</p><p>Allocation-cost reconciliation remains deferred; no difference is redistributed. Full Spark amounts use statement funding expense.</p><p>Statement: <code>{report!.statement_report_hash}</code></p><p>Expenses: <code>{report!.expense_revision}</code></p><p>Margins: <code>{report!.report_hash}</code></p></details>
 </section>;
}

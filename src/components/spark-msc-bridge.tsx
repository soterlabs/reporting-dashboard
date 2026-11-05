"use client";
import { useState } from "react";
import type { FinancialStatement, Metric } from "@/lib/financial";
import { metricAmount } from "@/lib/financial";
import { FinancialNumber } from "./financial-number";

const explanations:Record<string,string>={
  accrual_vs_MSC_cash_receipts:"Accrued issuer income versus received cash",
  gross_yield_including_Savings_funded_holdings:"Gross yield includes Savings-funded holdings",
  separate_PSM3_share_yield:"PSM3 share yield",
  reporting_only_income_stream:"Additional reporting income",
  escrow_capital_and_receipt_attribution_requires_review:"Escrow funding/payment classification needs review",
  venue_yield_fee_or_recognition_difference_requires_review:"Yield, fee or timing difference needs review",
};
export function SparkMscBridge({report}:{report?:FinancialStatement|null}){
  const months=report?.spark_msc_reconciliation || [];
  const [selected,setSelected]=useState(months.filter(m=>m.source_ref).at(-1)?.month || months.at(-1)?.month || "");
  if(!report || report.prime!=="spark" || !months.length)return null;
  const current=months.find(m=>m.month===selected) || months[0];
  const number=(cell:Metric)=><FinancialNumber value={metricAmount(cell)} evidence={cell} detail={cell.reason || undefined}/>;
  const comparisons=[
    ["Net interest income",current.MSC_supply_less_Savings,current.reporting_net_interest,current.net_interest_difference],
    ["Total net revenue",current.MSC_total_less_Savings,current.reporting_net_revenue,current.net_revenue_difference],
  ] as const;
  return <section className="panel spark-msc-bridge" aria-labelledby="spark-msc-heading">
    <div className="panel-heading"><h2 id="spark-msc-heading">MSC to reporting</h2><label className="reconciliation-month">Month <select aria-label="MSC comparison month" value={current.month} onChange={e=>setSelected(e.target.value)}>{months.map(m=><option key={m.month} value={m.month}>{m.month}</option>)}</select></label></div>
    <p className="panel-note">{current.source_ref ? "MSC adjusted for Savings interest. Differences below still need review." : "MSC summary is not yet available for this month."}</p>
    <div className="table-wrap"><table><thead><tr><th>Comparison</th><th>MSC less Savings interest</th><th>Reporting</th><th>Difference</th></tr></thead><tbody>{comparisons.map(([label,msc,reporting,difference])=><tr key={label}><th scope="row">{label}</th><td>{number(msc)}</td><td>{number(reporting)}</td><td>{number(difference)}</td></tr>)}</tbody></table></div>
    <details className="msc-adjustments"><summary>Allocation and recognition differences</summary><div className="table-wrap"><table><thead><tr><th>Component</th><th>MSC</th><th>Reporting</th><th>Difference</th><th>Explanation</th></tr></thead><tbody>{current.venue_differences.filter(d=>metricAmount(d.difference)===null || Math.abs(Number(metricAmount(d.difference)))>=0.5).map(d=><tr key={d.id}><th scope="row">{d.label}</th><td>{number(d.MSC)}</td><td>{number(d.reporting)}</td><td>{number(d.difference)}</td><td>{explanations[d.reason] || d.reason}</td></tr>)}</tbody></table></div><p className="panel-note">Known differences can offset each other. A zero residual does not certify the inputs.</p></details>
    <details className="msc-adjustments"><summary>Fees and non-stable revaluation</summary><div className="table-wrap"><table><tbody>{Object.entries(current.other_reporting_components).map(([key,cell])=><tr key={key}><th scope="row">{{sparklend_fees:"SparkLend fees",curator_fees:"Curator fees",other_rewards:"Other rewards",nonstable_gains:"Net gains on non-stable assets"}[key] || key}</th><td>{number(cell)}</td></tr>)}</tbody></table></div><p className="panel-note">These are already in the income statement. The September MSC catch-up for earlier SparkLend fees is not added again.</p></details>
    {current.reviewed_cash_evidence!==null && <p className="panel-note">Reviewed cash evidence is available in the API. Anchorage escrow payments still require purpose confirmation; no loan accrual terms are inferred.</p>}
  </section>;
}

import type { CashFlowReport } from "@/lib/cash-flow-api";
import type { FinancialStatement } from "@/lib/financial";
import { reconciliationChecks } from "@/lib/cash-flow-reconciliation";
import { money, type Prime } from "@/lib/reporting";

export function CashFlowReconciliation({prime,year,month,report,financial,retained}:{
  prime:Prime;year:number;month:string;report?:CashFlowReport|null;financial?:FinancialStatement|null;retained?:boolean;
}) {
  const checks=reconciliationChecks({prime,year,month,report,financial,retained});
  const status={reconciled:"Reconciled",difference:"Difference remains",unverifiable:"Not yet verifiable"};
  const icon={reconciled:"✓",difference:"!",unverifiable:"…"};
  return <section className="panel reconciliation-card" aria-labelledby="reconciliation-heading">
    <div className="panel-heading"><div><h2 id="reconciliation-heading">Reconciliation checks</h2><p>{new Date(month+"-01T00:00:00Z").toLocaleDateString("en-US",{month:"long",year:"numeric",timeZone:"UTC"})} · USD</p></div></div>
    <div className="reconciliation-checks">{checks.map(check=><details key={check.id} className="reconciliation-check" data-check-id={check.id} data-status={check.status}>
      <summary><span className="reconciliation-label">{check.label}</span><span className="reconciliation-result"><span aria-hidden="true">{icon[check.status]}</span> {status[check.status]}{check.difference!==null && <small>{check.status==="unverifiable" ? "Known difference" : "Difference"}: {money(check.difference)}</small>}</span></summary>
      <div className="reconciliation-detail"><p>{check.message}</p><p>{check.formula}</p>
        <dl>{check.inputs.map((input,i)=><div key={i}><dt>{input.label}</dt><dd>{input.amount===null ? "TBD" : <>{money(input.amount)}{input.estimated&&<sup aria-label="Estimated or provisional">*</sup>}{!input.complete&&input.amount!==null&&<small> · incomplete</small>}</>}</dd></div>)}</dl>
        {check.tolerance!==null&&<p>Tolerance: {money(check.tolerance)}{check.id==="cash" ? " (workbook policy)" : ""}.</p>}
        {check.sources.length>0&&<ul className="reconciliation-sources">{check.sources.map((s,i)=><li key={i}><a href={s.href} target="_blank" rel="noreferrer">{s.label}</a></li>)}</ul>}
      </div>
    </details>)}</div>
    <p className="panel-note">Checks use independent comparisons. Missing data is never treated as zero. * Provisional.</p>
  </section>;
}

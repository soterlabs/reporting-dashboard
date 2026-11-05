import Decimal from "decimal.js";
import type { CashFlowReport } from "./cash-flow-api.ts";
import { metricAmount, type FinancialStatement, type Metric } from "./financial.ts";
import type { Prime } from "./reporting.ts";
import references from "./data/settlement-cash-checks-2026.v1.json" with { type: "json" };

const D = Decimal.clone({ precision: 150 });
export type CheckInput = { label: string; amount: string | null; complete: boolean; estimated: boolean; source?: string };
export type ReconciliationCheck = {
  id: string; label: string; formula: string;
  status: "reconciled" | "difference" | "unverifiable";
  message: string; inputs: CheckInput[]; difference: string | null; tolerance: string | null;
  sources: { label: string; href: string }[];
};
const missing = (label: string): CheckInput => ({ label, amount: null, complete: false, estimated: false });
const sum = (inputs: CheckInput[]) => inputs.some(i => i.amount !== null)
  ? inputs.reduce((n, i) => n.plus(i.amount ?? "0"), new D(0)).toString() : null;

// A known partial amount can be displayed, but can never certify a comparison.
export function compareCheck(base: Omit<ReconciliationCheck, "status" | "message" | "difference">,
  lhs: string | null, rhs: string | null, blocked?: string): ReconciliationCheck {
  const difference = lhs !== null && rhs !== null ? new D(lhs).minus(rhs).toString() : null;
  if (blocked || difference === null || base.inputs.some(i => !i.complete || i.estimated || i.amount === null))
    return { ...base, difference, status: "unverifiable", message: blocked || "Missing or provisional inputs." };
  const matches = new D(difference!).abs().lte(base.tolerance ?? "0");
  return { ...base, difference, status: matches ? "reconciled" : "difference",
    message: matches ? "Independent amounts match within tolerance." : "An unexplained difference remains." };
}

export function reconciliationChecks({ prime, year, month, report, financial, retained = false }:{
  prime: Prime; year: number; month: string; report?: CashFlowReport | null;
  financial?: FinancialStatement | null; retained?: boolean;
}): ReconciliationCheck[] {
  if (report && (report.prime !== prime || report.year !== year)) throw new Error("Cash check scope differs");
  if (financial && (financial.prime !== prime || financial.year !== year)) throw new Error("Income check scope differs");
  if (!new RegExp(`^${year}-(0[1-9]|1[0-2])$`).test(month)) throw new Error("Cash check month differs");
  const p = report?.periods.find(p => p.key === month);
  const cash = (id: string, label: string, selected = month): CheckInput => {
    const period = report?.periods.find(p => p.key === selected);
    const cell = report?.lines.find(r => r.id === id)?.values[selected];
    return { label, amount: metricAmount(cell), complete: !!period?.revision && !period.stale &&
      period.state !== "future" && cell?.status === "available", estimated: cell?.quality === "estimate",
      source: period?.revision ? `/api/cash-flow/${["opening-cash","closing-cash","measured-cash"].includes(id) ? "balances" : "events"}?${new URLSearchParams({prime, month:selected, revision:period.revision})}` : undefined };
  };
  const blocked = retained ? "Refresh failed; retained evidence cannot certify reconciliation."
    : !p?.revision ? "No cash-flow publication for this month."
    : p.stale ? "Cash-flow publication does not reach the selected cutoff."
    : undefined;
  const elapsed=Array.from({length:Number(month.slice(5))},(_,i)=>`${year}-${String(i+1).padStart(2,"0")}`);
  const cumulative=(rows:CheckInput[],label:string):CheckInput=>({label,amount:sum(rows),complete:rows.every(r=>r.complete),estimated:rows.some(r=>r.estimated)});
  const checks: ReconciliationCheck[] = [];
  const coverage=report?.monthly_coverage[month];
  const scopeComplete=coverage?.classification_complete === true && !coverage.missing_chains.length &&
    !coverage.partial_chains?.length && !coverage.token_registry_gaps?.length && !coverage.unclassified_events &&
    !Object.keys(coverage.savings_failures).length;
  const opening = cash("opening-cash", "Opening cash"), flow = cash("net-cash-change", "Net cash flow"), closing = cash("closing-cash", "Measured closing cash");
  checks.push(compareCheck({id:"cash",label:"Cash balance",formula:"Measured closing cash − opening cash − net cash flow",
    inputs:[opening,flow,closing],tolerance:"5000000",sources:[]},
    closing.amount,
    opening.amount !== null && flow.amount !== null ? new D(opening.amount).plus(flow.amount).toString() : null, blocked || (!scopeComplete ? "Cash perimeter or event classification is incomplete." : undefined) || ([opening,flow,closing].some(i=>!i.complete) ? "Cash coverage or statement attribution is incomplete." : undefined)));
  const drawn = cash("usds-drawn", "Net borrowing"), direct = missing("Sky-direct capital");
  checks.push(compareCheck({id:"debt",label:"Sky debt",formula:"Opening debt + net borrowing + Sky-direct capital + MSC debt minted − closing debt",
    inputs:[missing("Opening debt"),drawn,direct,missing("MSC debt minted"),missing("Closing debt")],tolerance:"1",sources:[]},null,null,
    "Independent opening/closing Vat debt and the complete debt-mint ledger are not published."));
  const receivable = cash("msc-receivable", "Calculated closing receivable");
  const openingReceivable=report ? {label:"Opening MSC receivable",amount:String(report.methodology.opening_msc_receivable),complete:true,estimated:false} : missing("Opening MSC receivable");
  const earned=cumulative(elapsed.map(m=>{
    const input=cash("earned-not-received","Approved earned entitlement",m);
    return {...input,amount:input.amount===null ? null : new D(input.amount).negated().toString()};
  }),"Approved earned entitlement, YTD");
  const received=cumulative(elapsed.flatMap(m=>[cash("sky-allocation-receipts","Allocation receipts",m),cash("sky-demand-receipts","Demand-side receipts",m)]),"Sky cash receipts, YTD");
  checks.push(compareCheck({id:"receivable",label:"MSC receivable",formula:"Opening receivable + earned entitlement − receipts versus independent closing receivable",
    inputs:[openingReceivable,earned,received,receivable,missing("Independent closing receivable")],tolerance:"1",sources:[]},receivable.amount,null,
    "Next-spell or quarterly-report receivable comparison is not published."));
  const refs=references.records.filter(r=>r.prime===prime && r.execution_date.startsWith(month) && (!p?.actual_cutoff || r.execution_date<=p.actual_cutoff));
  const expected:CheckInput={label:"Published settlement payments",amount:refs.length ? refs.reduce((s,r)=>s.plus(r.amount),new D(0)).toString() : null,
    complete:refs.length>0,estimated:false};
  const allocation=cash("sky-allocation-receipts","Allocation receipts"), demand=cash("sky-demand-receipts","Demand-side receipts");
  checks.push(compareCheck({id:"settlement",label:"Sky settlement receipts",formula:"Allocation receipts + demand-side receipts − published payments (execution month)",
    inputs:[allocation,demand,expected],tolerance:"1",sources:refs.map(r=>({label:`Settlement · ${r.execution_date}`,href:r.source_url}))},
    allocation.amount!==null && demand.amount!==null ? new D(allocation.amount).plus(demand.amount).toString() : null,expected.amount,
    blocked || (!refs.length ? "No reviewed settlement-payment reference for this period; absence is not zero." : undefined)));
  const booked=elapsed.map(m=>{
    const source=cash("expenses-booked","Booked cash-payable expenses",m);
    if(source.amount!==null)return source;
    // Grove's workbook is useful evidence, but provisional booked costs cannot
    // stand in for observed cash payments. Exclude own-token incentive expense.
    const cell=(id:string):Metric|undefined=>financial?.lines.find(r=>r.id===id)?.values[m];
    const all=cell("expenses.total"), token=cell("expenses.prime_token");
    const a=metricAmount(all),t=metricAmount(token);
    return {...source,amount:a!==null&&t!==null ? new D(a).minus(t).toString() : null,
      complete:all?.status==="available"&&token?.status==="available",estimated:true,source:`/primes/${prime}?view=income&year=${year}&month=${m}`};
  });
  const paid=elapsed.map(m=>cash("expenses-paid","Cash expenses paid",m));
  checks.push(compareCheck({id:"expenses",label:"Expense payments",formula:"Cumulative cash expenses paid versus booked cash-payable expenses and agreed timing allowance",
    inputs:[cumulative(booked,"Booked cash-payable expenses, YTD"),cumulative(paid,"Cash expenses paid, YTD"),missing("Agreed timing allowance")],tolerance:null,
    sources:financial?.dashboard_composition ? [{label:"Expense statement and workbook provenance",href:`/primes/${prime}?view=income&year=${year}&month=${month}`}] : []},null,null,
    "Payment timing/opening payables are not reconciled; workbook costs remain provisional."));
  const buybacks=cash("buybacks","Onchain buybacks (cash outflow)");
  checks.push(compareCheck({id:"buybacks",label:"Token buybacks",formula:"Onchain buyback spending versus independently reported buybacks",
    inputs:[buybacks,missing("Independent reported buybacks")],tolerance:"1",sources:[]},null,null,
    "Independent reported buyback total is not published."));
  return checks.map(c=>({...c,sources:[...c.sources,...c.inputs.filter(i=>i.source&&i.amount!==null).map(i=>({label:i.label,href:i.source!}))]}));
}

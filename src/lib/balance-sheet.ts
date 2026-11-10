import Decimal from "decimal.js";
import {metricAmount} from "./financial.ts";
import type {BalanceSheetReport} from "./balance-sheet-api.ts";
import type {StatementLine} from "./prime-reports.ts";
const D=Decimal;
export function balanceSheetRows(doc:BalanceSheetReport):StatementLine[]{
 return doc.lines.filter(r=>r.kind==="section"||r.kind==="total"||!doc.periods.filter(p=>p.state!=="future").every(p=>r.values[p.key].status==="available"&&new D(r.values[p.key].value!).isZero()))
  .map(r=>({id:r.id,label:r.label,parent:doc.lines.find(parent=>parent.id===r.parent)?.kind==="section"?undefined:r.parent||undefined,level:r.depth,kind:r.kind||undefined}));
}
export function balanceSheetCsv(doc:BalanceSheetReport):unknown[][]{
 return [["",...doc.periods.map(p=>p.key),"Latest","Row ID","Report hash","Selection","Source revisions","Monthly coverage"],
 ...balanceSheetRows(doc).map(r=>{const row=doc.lines.find(l=>l.id===r.id)!;return [row.label,...doc.periods.map(p=>row.kind==="section"?"":p.state==="future"?"—":metricAmount(row.values[p.key])??"TBD"),row.kind==="section"?"":metricAmount(row.total)??"TBD",row.id,doc.report_hash,doc.selection,JSON.stringify(doc.source_manifest),JSON.stringify(Object.fromEntries(doc.periods.map(p=>[p.key,row.values[p.key].status])))];})];
}

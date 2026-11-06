// Display labels do not alter the retained API document or its source hash.
export function statementDisplayLabel(id: string, label: string) {
  if (id === "net-cash-change") return "Net increase in cash and stablecoin balances";
  return ["gains", "non-stable-gains"].includes(id) ? "Net gains on non-stable assets" : label;
}

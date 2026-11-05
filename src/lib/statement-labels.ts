// Display labels do not alter the retained API document or its source hash.
export function statementDisplayLabel(id: string, label: string) {
  return ["gains", "non-stable-gains"].includes(id) ? "Net gains on non-stable assets" : label;
}

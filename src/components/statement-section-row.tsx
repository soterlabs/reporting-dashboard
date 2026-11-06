import type { ReactNode } from "react";

export function StatementSectionRow({
  id,
  depth,
  columns,
  children,
}: {
  id: string;
  depth: number;
  columns: number;
  children: ReactNode;
}) {
  return (
    <tr className="section" data-row-id={id} data-depth={depth}>
      <th className="statement-section-cell" colSpan={columns} scope="row">
        <div className="statement-section-label">{children}</div>
      </th>
    </tr>
  );
}

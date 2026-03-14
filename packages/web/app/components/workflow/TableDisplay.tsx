import { Table } from "@cloudflare/kumo/components/table";
import type {
  NormalizedTableColumn,
  NormalizedTableRow,
  RowKeyValue,
} from "relay-sdk/client";

interface TableDisplayProps {
  columns: NormalizedTableColumn[];
  rows: NormalizedTableRow[];
  /** When set, rows become selectable with checkboxes. */
  selection?: "single" | "multiple";
  selectedKeys?: Set<RowKeyValue>;
  onToggleRow?: (key: RowKeyValue) => void;
}

/**
 * Pure table rendering — no data fetching, no pagination controls.
 * Used by both ServerTable (loader-backed) and StaticTable (inline data).
 */
export function TableDisplay({
  columns,
  rows,
  selection,
  selectedKeys,
  onToggleRow,
}: TableDisplayProps) {
  if (rows.length === 0) {
    return (
      <div className="text-sm leading-relaxed text-kumo-subtle">(no rows)</div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table className="text-sm">
        <Table.Header>
          <Table.Row>
            {selection && <Table.CheckHead />}
            {columns.map((col) => (
              <Table.Head key={col.key}>{col.label}</Table.Head>
            ))}
          </Table.Row>
        </Table.Header>
        <Table.Body>
          {rows.map((row, rowIndex) => {
            const key = row.rowKey ?? `${rowIndex}`;
            const checked = selection
              ? (selectedKeys?.has(key) ?? false)
              : false;

            return (
              <Table.Row
                key={key}
                variant={checked ? "selected" : "default"}
                onClick={
                  selection && onToggleRow ? () => onToggleRow(key) : undefined
                }
                className={selection ? "cursor-pointer" : undefined}
              >
                {selection && (
                  <Table.CheckCell
                    checked={checked}
                    onValueChange={
                      onToggleRow ? () => onToggleRow(key) : undefined
                    }
                  />
                )}
                {columns.map((col) => (
                  <Table.Cell key={col.key}>
                    {row.cells[col.key] ?? ""}
                  </Table.Cell>
                ))}
              </Table.Row>
            );
          })}
        </Table.Body>
      </Table>
    </div>
  );
}

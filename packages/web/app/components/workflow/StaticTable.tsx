import { useEffect, useMemo, useRef, useState } from "react";
import type { LoaderTableData, RowKeyValue } from "relay-sdk/client";
import { TableDisplay } from "./TableDisplay";
import { TableToolbar } from "./TableToolbar";

const DEFAULT_PAGE_SIZE = 20;

interface StaticTableProps {
  data: LoaderTableData;
  title?: string;
  pageSize?: number;
  /** When set, rows become selectable with checkboxes. */
  selection?: "single" | "multiple";
  defaultSelectedKeys?: RowKeyValue[];
  onSelectionChange?: (keys: RowKeyValue[]) => void;
}

/**
 * Renders a table from inline data with client-side filtering and pagination.
 * No HTTP fetching — all data is available upfront.
 */
export function StaticTable({
  data,
  title,
  pageSize = DEFAULT_PAGE_SIZE,
  selection,
  defaultSelectedKeys,
  onSelectionChange,
}: StaticTableProps) {
  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [selectedKeys, setSelectedKeys] = useState<Set<RowKeyValue>>(
    () => new Set(defaultSelectedKeys ?? []),
  );

  // Client-side filter: match query against any cell value in each row.
  const filteredRows = useMemo(() => {
    if (!debouncedQuery) return data.rows;
    const lower = debouncedQuery.toLowerCase();
    return data.rows.filter((row) =>
      Object.values(row.cells).some((cell) =>
        cell.toLowerCase().includes(lower),
      ),
    );
  }, [data.rows, debouncedQuery]);

  // Client-side pagination: slice the filtered rows.
  const totalCount = filteredRows.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const pagedRows = filteredRows.slice(page * pageSize, (page + 1) * pageSize);
  const hasPrev = page > 0;
  const hasNext = page < totalPages - 1;

  // Only show toolbar when there are enough rows to paginate.
  const showToolbar = data.rows.length > pageSize;

  useEffect(() => {
    if (selection) {
      onSelectionChange?.(Array.from(selectedKeys));
    }
  }, [selection, onSelectionChange, selectedKeys]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      setDebouncedQuery(value);
    }, 300);
  };

  const toggleRow = (key: RowKeyValue) => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (selection === "single") {
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.clear();
          next.add(key);
        }
      } else if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const toolbar = showToolbar ? (
    <TableToolbar
      query={query}
      onQueryChange={handleQueryChange}
      page={page}
      totalPages={totalPages}
      totalCount={totalCount}
      hasPrev={hasPrev}
      hasNext={hasNext}
      onPrev={() => setPage((p) => p - 1)}
      onNext={() => setPage((p) => p + 1)}
    />
  ) : null;

  return (
    <div className="space-y-2">
      {title && (
        <div className="text-base font-medium text-[#ddd]">{title}</div>
      )}

      <div className="border border-[#222] rounded-md overflow-hidden">
        {toolbar && <div className="border-b border-[#222]">{toolbar}</div>}

        <TableDisplay
          columns={data.columns}
          rows={pagedRows}
          selection={selection}
          selectedKeys={selectedKeys}
          onToggleRow={toggleRow}
        />

        {toolbar && <div className="border-t border-[#222]">{toolbar}</div>}
      </div>

      {selection && selectedKeys.size > 0 && (
        <div className="text-xs text-kumo-subtle">
          {selectedKeys.size} row{selectedKeys.size !== 1 ? "s" : ""} selected
        </div>
      )}
    </div>
  );
}

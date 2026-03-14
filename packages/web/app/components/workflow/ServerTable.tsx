import { useCallback, useEffect, useRef, useState } from "react";
import type { LoaderTableData, RowKeyValue } from "relay-sdk/client";
import { apiPath } from "../../lib/api";
import { TableDisplay } from "./TableDisplay";
import { TableToolbar } from "./TableToolbar";

interface ServerTableProps {
  loader: { path: string; pageSize?: number };
  title?: string;
  /** When set, rows become selectable with checkboxes. */
  selection?: "single" | "multiple";
  defaultSelectedKeys?: RowKeyValue[];
  onSelectionChange?: (keys: RowKeyValue[]) => void;
  disabled?: boolean;
}

/**
 * Loader-backed table — fetches pages from the server via HTTP.
 * Owns search debouncing and server-side pagination controls.
 */
export function ServerTable({
  loader,
  title,
  selection,
  defaultSelectedKeys,
  onSelectionChange,
  disabled,
}: ServerTableProps) {
  const pageSize = loader.pageSize ?? 20;

  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [data, setData] = useState<LoaderTableData | null>(null);
  const [loading, setLoading] = useState(!disabled);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [selectedKeys, setSelectedKeys] = useState<Set<RowKeyValue>>(
    () => new Set(defaultSelectedKeys ?? []),
  );

  const fetchData = useCallback(
    async (p: number, q: string) => {
      setLoading(true);
      setError(null);
      const url = apiPath(loader.path);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            page: p,
            pageSize,
            query: q || undefined,
          }),
        });
        if (!res.ok) {
          throw new Error(`Loader returned ${res.status}`);
        }
        const result: LoaderTableData = await res.json();
        setData(result);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to fetch data");
      } finally {
        setLoading(false);
      }
    },
    [loader.path, pageSize],
  );

  useEffect(() => {
    if (!disabled) {
      fetchData(page, debouncedQuery);
    }
  }, [page, debouncedQuery, fetchData, disabled]);

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
    if (disabled) return;

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

  const totalCount = data?.totalCount;
  const totalPages =
    totalCount !== undefined ? Math.ceil(totalCount / pageSize) : undefined;
  const hasNext =
    totalPages !== undefined
      ? page < totalPages - 1
      : (data?.rows.length ?? 0) === pageSize;
  const hasPrev = page > 0;

  const toolbar = (
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
      loading={loading}
    />
  );

  return (
    <div className="space-y-2">
      {title && (
        <div className="text-base font-medium text-[#ddd]">{title}</div>
      )}

      <div className="border border-[#222] rounded-md overflow-hidden">
        {!disabled && <div className="border-b border-[#222]">{toolbar}</div>}

        {error ? (
          <div className="text-sm text-red-400 p-3">{error}</div>
        ) : data ? (
          <TableDisplay
            columns={data.columns}
            rows={data.rows}
            selection={selection}
            selectedKeys={selectedKeys}
            onToggleRow={toggleRow}
          />
        ) : null}

        {!disabled && <div className="border-t border-[#222]">{toolbar}</div>}
      </div>

      {selection && selectedKeys.size > 0 && (
        <div className="text-xs text-kumo-subtle">
          {selectedKeys.size} row{selectedKeys.size !== 1 ? "s" : ""} selected
        </div>
      )}
    </div>
  );
}

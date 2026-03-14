import { useCallback, useEffect, useRef, useState } from "react";
import { Table } from "@cloudflare/kumo/components/table";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Loader } from "@cloudflare/kumo/components/loader";
import type { LoaderTableData, RowKeyValue } from "relay-sdk/client";
import { apiPath } from "../../lib/api";

interface PaginatedTableProps {
  loader: { path: string; pageSize?: number };
  title?: string;
  /** When set, rows become selectable with checkboxes. */
  selection?: "single" | "multiple";
  defaultSelectedKeys?: RowKeyValue[];
  onSelectionChange?: (keys: RowKeyValue[]) => void;
  disabled?: boolean;
}

export function PaginatedTable({
  loader,
  title,
  selection,
  defaultSelectedKeys,
  onSelectionChange,
  disabled,
}: PaginatedTableProps) {
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

  // Notify parent when selection changes
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

  return (
    <div className="space-y-3">
      {title && (
        <div className="text-base font-medium text-[#ddd]">{title}</div>
      )}

      {!disabled && (
        <div className="flex items-center gap-3">
          <div className="w-64">
            <Input
              type="text"
              label="Search"
              placeholder="Search..."
              value={query}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                handleQueryChange(e.target.value)
              }
            />
          </div>
          {loading && <Loader size="sm" />}
        </div>
      )}

      {error ? (
        <div className="text-sm text-red-400">{error}</div>
      ) : data && data.rows.length === 0 ? (
        <div className="text-sm leading-relaxed text-kumo-subtle">
          (no rows)
        </div>
      ) : data ? (
        <div className="overflow-x-auto">
          <Table className="text-sm border border-[#222] rounded-md">
            <Table.Header>
              <Table.Row>
                {selection && <Table.CheckHead />}
                {data.columns.map((col) => (
                  <Table.Head key={col.key}>{col.label}</Table.Head>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.rows.map((row, rowIndex) => {
                const key = row.rowKey ?? `${rowIndex}`;
                const checked = selection ? selectedKeys.has(key) : false;

                return (
                  <Table.Row
                    key={key}
                    variant={checked ? "selected" : "default"}
                    onClick={selection ? () => toggleRow(key) : undefined}
                    className={selection ? "cursor-pointer" : undefined}
                  >
                    {selection && (
                      <Table.CheckCell
                        checked={checked}
                        onValueChange={() => toggleRow(key)}
                      />
                    )}
                    {data.columns.map((col) => (
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
      ) : null}

      {!disabled && (
        <div className="flex items-center gap-3 text-sm text-kumo-subtle">
          <Button
            variant="secondary"
            disabled={!hasPrev}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </Button>
          <span>
            Page {page + 1}
            {totalPages !== undefined ? ` of ${totalPages}` : ""}
            {totalCount !== undefined ? ` (${totalCount} total)` : ""}
          </span>
          <Button
            variant="secondary"
            disabled={!hasNext}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {selection && selectedKeys.size > 0 && (
        <div className="text-sm text-kumo-subtle">
          {selectedKeys.size} row{selectedKeys.size !== 1 ? "s" : ""} selected
        </div>
      )}
    </div>
  );
}

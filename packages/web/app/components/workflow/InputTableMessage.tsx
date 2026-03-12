import { useCallback, useEffect, useRef, useState } from "react";
import { Table } from "@cloudflare/kumo/components/table";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Loader } from "@cloudflare/kumo/components/loader";
import type {
  SerializedColumnDef,
  TableFieldDefinition,
} from "relay-sdk/client";
import { apiPath } from "../../lib/api";

interface InputTableMessageProps {
  eventName: string;
  prompt: string;
  fieldName: string;
  fieldDef: TableFieldDefinition;
  onSubmit: (
    eventName: string,
    value: Record<string, unknown>,
  ) => Promise<void>;
  /** When present the selection has already been submitted (replay / history) */
  submittedValue?: Record<string, unknown>;
}

type LoaderResponse = {
  data: Record<string, unknown>[];
  totalCount?: number;
};

type ResolvedColumn = {
  label: string;
  accessorKey?: string;
  renderIndex?: number;
};

export function InputTableMessage({
  eventName,
  prompt,
  fieldName,
  fieldDef,
  onSubmit,
  submittedValue,
}: InputTableMessageProps) {
  const { loader, rowKey, selection } = fieldDef;
  const pageSize = loader.pageSize ?? 20;

  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [data, setData] = useState<LoaderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Track selected rows by their rowKey value. The client never holds full
  // source rows — only the display columns from the loader response.
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const isSubmitted = !!submittedValue;

  const fetchData = useCallback(
    async (p: number, q: string) => {
      setLoading(true);
      setError(null);

      const [basePath, baseQuery = ""] = loader.path.split("?");
      const params = new URLSearchParams(baseQuery);
      params.set("page", String(p));
      params.set("pageSize", String(pageSize));
      if (q) params.set("query", q);

      const url = apiPath(`${basePath}?${params}`);

      try {
        const res = await fetch(url);
        if (!res.ok) {
          throw new Error(`Loader returned ${res.status}`);
        }
        const result: LoaderResponse = await res.json();
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
    // Don't fetch if already submitted (viewing history)
    if (!isSubmitted) {
      fetchData(page, debouncedQuery);
    }
  }, [page, debouncedQuery, fetchData, isSubmitted]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      setDebouncedQuery(value);
    }, 300);
  };

  const toggleRow = (key: string) => {
    if (isSubmitted) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (selection === "single") {
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.clear();
          next.add(key);
        }
      } else {
        if (next.has(key)) {
          next.delete(key);
        } else {
          next.add(key);
        }
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    if (isSubmitted || selectedKeys.size === 0) return;

    // Send only the row identity values. The server resolves these back to
    // full source rows via the loader's resolve function.
    await onSubmit(eventName, { [fieldName]: Array.from(selectedKeys) });
  };

  const columns = resolveColumns(loader.columns, data?.data);

  // If already submitted, show a summary instead of the interactive table
  if (isSubmitted && submittedValue) {
    const keys = (submittedValue[fieldName] as string[]) ?? [];
    return (
      <div className="p-5 rounded-xl border bg-[#111] border-[#222] space-y-3">
        <span className="text-base font-medium text-[#fafafa]">{prompt}</span>
        <div className="text-sm text-kumo-subtle">
          Selected {keys.length} row{keys.length !== 1 ? "s" : ""}
        </div>
      </div>
    );
  }

  const totalCount = data?.totalCount;
  const totalPages =
    totalCount !== undefined ? Math.ceil(totalCount / pageSize) : undefined;
  const hasNext =
    totalPages !== undefined
      ? page < totalPages - 1
      : (data?.data.length ?? 0) === pageSize;
  const hasPrev = page > 0;

  return (
    <div className="p-5 rounded-xl border bg-[#111] border-[#222] space-y-3">
      <span className="text-base font-medium text-[#fafafa]">{prompt}</span>

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

      {error ? (
        <div className="text-sm text-red-400">{error}</div>
      ) : data && data.data.length === 0 ? (
        <div className="text-sm leading-relaxed text-kumo-subtle">
          (no rows)
        </div>
      ) : data ? (
        <div className="overflow-x-auto">
          <Table className="text-sm border border-[#222] rounded-md">
            <Table.Header>
              <Table.Row>
                <Table.CheckHead />
                {columns.map((col) => (
                  <Table.Head key={col.label}>{col.label}</Table.Head>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.data.map((row) => {
                const key = String(row[rowKey] ?? "");
                const checked = selectedKeys.has(key);
                return (
                  <Table.Row
                    key={key}
                    variant={checked ? "selected" : "default"}
                    onClick={() => toggleRow(key)}
                    className="cursor-pointer"
                  >
                    <Table.CheckCell
                      checked={checked}
                      onValueChange={() => toggleRow(key)}
                    />
                    {columns.map((col) => (
                      <Table.Cell key={col.label}>
                        {formatCellValue(getCellValue(row, col))}
                      </Table.Cell>
                    ))}
                  </Table.Row>
                );
              })}
            </Table.Body>
          </Table>
        </div>
      ) : null}

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

      <div className="flex items-center gap-3 pt-2">
        <Button
          type="button"
          disabled={selectedKeys.size === 0}
          onClick={handleSubmit}
        >
          {selection === "single"
            ? "Select"
            : `Select ${selectedKeys.size > 0 ? `(${selectedKeys.size})` : ""}`}
        </Button>
        {selectedKeys.size > 0 && (
          <span className="text-sm text-kumo-subtle">
            {selectedKeys.size} row{selectedKeys.size !== 1 ? "s" : ""} selected
          </span>
        )}
      </div>
    </div>
  );
}

// TODO: this shouldn't be necessary - client shouldn't have to reconstruct columns
function resolveColumns(
  columns: SerializedColumnDef[] | undefined,
  data: Record<string, unknown>[] | undefined,
): ResolvedColumn[] {
  if (columns && columns.length > 0) {
    return columns.map((col, index) => {
      if (col.type === "accessor") {
        return { label: col.label, accessorKey: col.accessorKey };
      }
      return { label: col.label, renderIndex: index };
    });
  }

  if (data && data.length > 0) {
    const keys = Array.from(
      new Set(data.flatMap((row) => Object.keys(row))),
    ).filter((k) => !k.startsWith("__render_"));
    return keys.map((key) => ({ label: key, accessorKey: key }));
  }

  return [];
}

function getCellValue(
  row: Record<string, unknown>,
  col: ResolvedColumn,
): unknown {
  if (col.renderIndex !== undefined) {
    return row[`__render_${col.renderIndex}`];
  }
  if (col.accessorKey) {
    return row[col.accessorKey];
  }
  return "";
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const obj = value as { label?: string; value?: string };
    return obj.label ?? obj.value ?? JSON.stringify(value);
  }
  return String(value);
}

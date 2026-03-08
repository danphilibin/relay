import { useCallback, useEffect, useRef, useState } from "react";
import { Table } from "@cloudflare/kumo/components/table";
import { Button } from "@cloudflare/kumo/components/button";
import { Input } from "@cloudflare/kumo/components/input";
import { Loader } from "@cloudflare/kumo/components/loader";
import type {
  OutputTableLoaderBlock,
  SerializedColumnDef,
} from "relay-sdk/client";
import { apiPath } from "../../lib/api";

interface PaginatedTableProps {
  block: OutputTableLoaderBlock;
}

type LoaderResponse = {
  data: Record<string, unknown>[];
  totalCount?: number;
};

export function PaginatedTable({ block }: PaginatedTableProps) {
  const { loader } = block;
  const pageSize = loader.pageSize ?? 20;

  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [data, setData] = useState<LoaderResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fetchData = useCallback(
    async (p: number, q: string) => {
      setLoading(true);
      setError(null);

      // The SDK now hands the browser a server-built path. The UI only adds
      // page/search inputs instead of rebuilding loader details itself.
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
    fetchData(page, debouncedQuery);
  }, [page, debouncedQuery, fetchData]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      setDebouncedQuery(value);
    }, 300);
  };

  // Determine columns to display
  const columns = resolveColumns(loader.columns, data?.data);

  const totalCount = data?.totalCount;
  const totalPages =
    totalCount !== undefined ? Math.ceil(totalCount / pageSize) : undefined;
  const hasNext =
    totalPages !== undefined
      ? page < totalPages - 1
      : (data?.data.length ?? 0) === pageSize;
  const hasPrev = page > 0;

  return (
    <div className="space-y-3">
      {block.title && (
        <div className="text-base font-medium text-[#ddd]">{block.title}</div>
      )}

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
                {columns.map((col) => (
                  <Table.Head key={col.label}>{col.label}</Table.Head>
                ))}
              </Table.Row>
            </Table.Header>
            <Table.Body>
              {data.data.map((row, rowIndex) => (
                <Table.Row key={rowIndex}>
                  {columns.map((col) => (
                    <Table.Cell key={col.label}>
                      {formatCellValue(getCellValue(row, col))}
                    </Table.Cell>
                  ))}
                </Table.Row>
              ))}
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
    </div>
  );
}

type ResolvedColumn = {
  label: string;
  accessorKey?: string;
  // For columns backed by renderCell(), the server adds a `__render_i` field
  // where `i` matches the column's position in the serialized columns array.
  renderIndex?: number;
};

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

  // Auto-derive from data keys (skip internal __render_ keys)
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

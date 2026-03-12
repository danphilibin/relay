import { useCallback, useEffect, useRef, useState } from "react";
import { Table } from "@cloudflare/kumo/components/table";
import { Input } from "@cloudflare/kumo/components/input";
import { Loader } from "@cloudflare/kumo/components/loader";
import type {
  SerializedColumnDef,
  TableFieldDefinition,
} from "relay-sdk/client";
import { apiPath } from "../../../lib/api";
import type { FieldProps } from "../SchemaFieldComponents";

type LoaderResponse = {
  data: Record<string, unknown>[];
  totalCount?: number;
};

type ResolvedColumn = {
  label: string;
  accessorKey?: string;
  renderIndex?: number;
};

export function TableField({
  fieldName,
  fieldDef,
  disabled,
  defaultValue,
  onChange,
}: FieldProps) {
  const def = fieldDef as TableFieldDefinition;
  const { loader, rowKey, selection } = def;
  const pageSize = loader.pageSize ?? 20;

  const [page, setPage] = useState(0);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [data, setData] = useState<LoaderResponse | null>(null);
  const [loading, setLoading] = useState(!disabled);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(
    () => new Set((defaultValue as string[] | undefined) ?? []),
  );

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
    onChange(fieldName, Array.from(selectedKeys));
  }, [fieldName, onChange, selectedKeys]);

  useEffect(() => {
    if (!disabled) {
      fetchData(page, debouncedQuery);
    }
  }, [page, debouncedQuery, fetchData, disabled]);

  const handleQueryChange = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setPage(0);
      setDebouncedQuery(value);
    }, 300);
  };

  const toggleRow = (key: string) => {
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

  const columns = resolveColumns(loader.columns, data?.data);
  const totalCount = data?.totalCount;
  const totalPages =
    totalCount !== undefined ? Math.ceil(totalCount / pageSize) : undefined;
  const hasNext =
    totalPages !== undefined
      ? page < totalPages - 1
      : (data?.data.length ?? 0) === pageSize;
  const hasPrev = page > 0;

  if (disabled) {
    const keys = Array.from(selectedKeys);
    return (
      <div className="space-y-2">
        <div className="text-base text-[#fafafa]">{def.label}</div>
        {def.description && (
          <div className="text-sm text-kumo-subtle">{def.description}</div>
        )}
        <div className="text-sm text-kumo-subtle">
          Selected {keys.length} row{keys.length !== 1 ? "s" : ""}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <div className="text-base text-[#fafafa]">{def.label}</div>
        {def.description && (
          <div className="text-sm text-kumo-subtle">{def.description}</div>
        )}
      </div>

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
        <button
          type="button"
          className="text-inherit disabled:opacity-50"
          disabled={!hasPrev}
          onClick={() => setPage((p) => p - 1)}
        >
          Previous
        </button>
        <span>
          Page {page + 1}
          {totalPages !== undefined ? ` of ${totalPages}` : ""}
          {totalCount !== undefined ? ` (${totalCount} total)` : ""}
        </span>
        <button
          type="button"
          className="text-inherit disabled:opacity-50"
          disabled={!hasNext}
          onClick={() => setPage((p) => p + 1)}
        >
          Next
        </button>
      </div>

      {selectedKeys.size > 0 && (
        <div className="text-sm text-kumo-subtle">
          {selectedKeys.size} row{selectedKeys.size !== 1 ? "s" : ""} selected
        </div>
      )}
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
    ).filter((key) => !key.startsWith("__render_"));
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

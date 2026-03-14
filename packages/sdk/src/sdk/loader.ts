/**
 * Loader primitives — server-side data fetching for paginated tables.
 *
 * Loaders are functions registered alongside a workflow that execute in
 * the Worker's fetch handler, completely outside the workflow lifecycle.
 */

import { registerTableRenderer } from "./registry";
import type { RowKeyValue } from "../isomorphic/table";

// ── Public types ────────────────────────────────────────────────────

/** Built-in pagination params that every loader receives */
export type PaginationParams = {
  query?: string;
  page: number;
  pageSize: number;
};

/** What a loader function returns */
export type LoaderResult<TRow> = {
  data: TRow[];
  totalCount?: number;
};

/** What a renderCell can return */
export type CellValue = string | { label?: string; value?: string };

/** Object column with accessorKey — reads a field from the row */
export type AccessorColumn<TRow> = {
  label: string;
  accessorKey: keyof TRow & string;
};

/** Object column with renderCell — computes a display value */
export type RenderColumn<TRow> = {
  label: string;
  renderCell: (row: TRow) => CellValue;
};

/** A single column definition: string shorthand or object */
export type ColumnDef<TRow> =
  | (keyof TRow & string)
  | AccessorColumn<TRow>
  | RenderColumn<TRow>;

/** Reusable table renderer for a row type */
export type TableRendererDef<TRow = unknown> = {
  __brand: "table_renderer";
  __row: TRow;
  /** Stable server-side lookup key for reapplying this table renderer on fetches */
  name: string;
  columns: ColumnDef<TRow>[];
};

// ── Param descriptor ────────────────────────────────────────────────

type ParamTypeMap = {
  string: string;
  number: number;
  boolean: boolean;
};

export type ParamDescriptor = Record<string, keyof ParamTypeMap>;

export type InferParams<D extends ParamDescriptor> = {
  [K in keyof D]: ParamTypeMap[D[K]];
};

// ── Internal types ──────────────────────────────────────────────────

/** Marker type for "no custom params" */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
type NoParams = {};

/** Check if NoParams extends P — true only when P is exactly {} */
type HasParams<P> = [NoParams] extends [P] ? false : true;

type ParamsOf<L> = L extends { fn: (params: infer P, env: Env) => Promise<any> }
  ? Omit<P, keyof PaginationParams>
  : never;

type RowOf<L> = L extends {
  fn: (...args: any[]) => Promise<LoaderResult<infer R>>;
}
  ? R
  : never;

// Re-export so consumers can import from either location.
export type { RowKeyValue } from "../isomorphic/table";

/** A loader definition — wraps the loader callback plus runtime metadata. */
export type LoaderDef<TParams = any, TRow = any> = {
  __brand: "loader";
  // These fields do not exist at runtime. They are only here so TypeScript can
  // remember the row and param types through helpers like createWorkflow().
  // row/param types through helpers like createWorkflow() and output.table().
  __params: TParams;
  __row: TRow;
  fn: (
    params: TParams & PaginationParams,
    env: Env,
  ) => Promise<LoaderResult<TRow>>;
  paramDescriptor?: ParamDescriptor;
  /** Field used to identify rows for interactive table selection */
  rowKey?: string;
  /** Resolves selected row keys back to full source rows for `input.table()` */
  resolve?: (
    params: { keys: RowKeyValue[] } & Record<string, unknown>,
    env: Env,
  ) => Promise<TRow[]>;
};

/** A serializable reference to a loader with bound params */
export type LoaderRef<TRow = unknown> = {
  __brand: "loader_ref";
  __row: TRow;
  name: string;
  // These params are captured during the workflow run, then persisted into a
  // DO-backed table descriptor so later page/search requests can fetch the
  // same scoped data without re-running workflow code.
  params: Record<string, unknown>;
  /** Carried from the loader definition so `input.table()` can validate selection. */
  rowKey?: string;
};

/** Derive the handler's `loaders` context from the config */
export type LoaderRefs<L extends Record<string, LoaderDef<any, any>>> = {
  [K in keyof L]: HasParams<ParamsOf<L[K]>> extends true
    ? (params: ParamsOf<L[K]>) => LoaderRef<RowOf<L[K]>>
    : LoaderRef<RowOf<L[K]>>;
};

// ── Serialized column def (for NDJSON stream, no functions) ─────────

export type SerializedColumnDef =
  | { type: "accessor"; label: string; accessorKey: string }
  | { type: "render"; label: string };

// ── loader() factory ────────────────────────────────────────────────

/** No custom params — infer TRow from the return type */
export function loader<TRow>(
  fn: (params: PaginationParams, env: Env) => Promise<LoaderResult<TRow>>,
): LoaderDef<NoParams, TRow>;

/** With param descriptor — both TParams and TRow inferred */
export function loader<D extends ParamDescriptor, TRow>(
  params: D,
  fn: (
    params: InferParams<D> & PaginationParams,
    env: Env,
  ) => Promise<LoaderResult<TRow>>,
): LoaderDef<InferParams<D>, TRow>;

/** Config object with rowKey + resolve — with custom params.
 * `K` is inferred from `rowKey` so that `resolve` receives keys typed as
 * `TRow[K][]` — e.g. `number[]` when the row's ID field is numeric. */
export function loader<
  D extends ParamDescriptor,
  TRow,
  K extends keyof TRow & string,
>(config: {
  rowKey: K;
  params: D;
  load: (
    params: InferParams<D> & PaginationParams,
    env: Env,
  ) => Promise<LoaderResult<TRow>>;
  resolve: (
    params: { keys: Extract<TRow[K], RowKeyValue>[] } & Partial<InferParams<D>>,
    env: Env,
  ) => Promise<TRow[]>;
}): LoaderDef<InferParams<D>, TRow>;

/** Config object with rowKey + resolve — no custom params.
 * `K` is inferred from `rowKey` so that `resolve` receives keys typed as
 * `TRow[K][]` — e.g. `number[]` when the row's ID field is numeric. */
export function loader<TRow, K extends keyof TRow & string>(config: {
  rowKey: K;
  load: (params: PaginationParams, env: Env) => Promise<LoaderResult<TRow>>;
  resolve: (
    params: { keys: Extract<TRow[K], RowKeyValue>[] },
    env: Env,
  ) => Promise<TRow[]>;
}): LoaderDef<NoParams, TRow>;

export function loader(...args: any[]): any {
  // Simple function form: loader(fn)
  if (typeof args[0] === "function") {
    return { __brand: "loader" as const, fn: args[0] };
  }

  // Config object form: loader({ rowKey, load, resolve, params? })
  if ("load" in args[0]) {
    const config = args[0];
    return {
      __brand: "loader" as const,
      fn: config.load,
      paramDescriptor: config.params,
      rowKey: config.rowKey,
      resolve: config.resolve,
    };
  }

  // Param descriptor form: loader(descriptor, fn)
  return {
    __brand: "loader" as const,
    fn: args[1],
    paramDescriptor: args[0],
  };
}

/** Create a named table renderer that can be reused across loader-backed tables.
 * Auto-registers into the global renderer registry at creation time (module scope). */
export function tableRenderer<TRow>(
  name: string,
  config: { columns: ColumnDef<TRow>[] },
): TableRendererDef<TRow> {
  const def: TableRendererDef<TRow> = {
    __brand: "table_renderer" as const,
    __row: undefined as TRow,
    name,
    columns: config.columns,
  };
  registerTableRenderer(def);
  return def;
}

// ── Table output types for loader-backed tables ─────────────────────

/** Static table (existing) */
export type TableOutputStatic = {
  title?: string;
  data: Array<Record<string, string>>;
};

/** Loader-backed table — columns are optional, typed against TRow */
export type TableOutputLoader<TRow = unknown> = {
  title?: string;
  source: LoaderRef<TRow>;
  pageSize?: number;
  columns?: ColumnDef<TRow>[];
  // Table renderers are the reusable, named version of table display logic.
  // Inline columns still work, but a table renderer avoids tying rendering to one run.
  renderer?: TableRendererDef<TRow>;
};

/** Options for selecting a single row from a loader-backed table. */
export type TableInputSingle<TRow> = {
  title: string;
  source: LoaderRef<TRow>;
  pageSize?: number;
  columns?: ColumnDef<TRow>[];
  renderer?: TableRendererDef<TRow>;
  selection?: "single";
};

/** Options for selecting multiple rows from a loader-backed table. */
export type TableInputMultiple<TRow> = {
  title: string;
  source: LoaderRef<TRow>;
  pageSize?: number;
  columns?: ColumnDef<TRow>[];
  renderer?: TableRendererDef<TRow>;
  selection: "multiple";
};

/** Helper to check if output.table was called with a loader source */
export function isLoaderTable<TRow = unknown>(
  opts: TableOutputStatic | TableOutputLoader<TRow>,
): opts is TableOutputLoader<TRow> {
  return "source" in opts && opts.source !== undefined;
}

/** Serialize column defs for the NDJSON stream (strips renderCell functions) */
export function serializeColumns<TRow>(
  columns: ColumnDef<TRow>[] | undefined,
): SerializedColumnDef[] | undefined {
  if (!columns) return undefined;
  return columns.map((col) => {
    if (typeof col === "string") {
      return { type: "accessor" as const, label: col, accessorKey: col };
    }
    if ("accessorKey" in col) {
      return {
        type: "accessor" as const,
        label: col.label,
        accessorKey: col.accessorKey,
      };
    }
    // Only the label is sent to the browser. The render fn stays on the server,
    // and the column index is later used to attach its computed value to
    // `__render_i`.
    return { type: "render" as const, label: col.label };
  });
}

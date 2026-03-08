/**
 * Loader primitives — server-side data fetching for paginated tables.
 *
 * Loaders are functions registered alongside a workflow that execute in
 * the Worker's fetch handler, completely outside the workflow lifecycle.
 */

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

/** Reusable table presenter for a row type */
export type PresenterDef<TRow = unknown> = {
  __brand: "presenter";
  __row: TRow;
  /** Stable server-side lookup key for reapplying this presenter on fetches */
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

/** A loader definition — wraps the fn + carries type-only metadata */
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
};

/** A serializable reference to a loader with bound params */
export type LoaderRef<TRow = unknown> = {
  __brand: "loader_ref";
  __row: TRow;
  name: string;
  // These params are captured during the workflow run, then copied into the
  // server-built loader path so later page/search requests can fetch the same
  // scoped data without re-running workflow code.
  params: Record<string, unknown>;
};

/** Derive the handler's `loaders` context from the config */
export type LoaderRefs<L extends Record<string, LoaderDef<any, any>>> = {
  [K in keyof L]: L[K] extends LoaderDef<infer P, infer R>
    ? HasParams<P> extends true
      ? (params: P) => LoaderRef<R>
      : LoaderRef<R>
    : never;
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

export function loader(...args: any[]): any {
  if (typeof args[0] === "function") {
    return { __brand: "loader" as const, fn: args[0] };
  }
  return {
    __brand: "loader" as const,
    fn: args[1],
    paramDescriptor: args[0],
  };
}

/** Create a named presenter that can be reused across loader-backed tables */
export function presenter<TRow>(
  name: string,
  config: { columns: ColumnDef<TRow>[] },
): PresenterDef<TRow> {
  return {
    __brand: "presenter" as const,
    __row: undefined as TRow,
    name,
    columns: config.columns,
  };
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
  // Presenters are the reusable, named version of table display logic.
  // Inline columns still work, but presenters avoid tying rendering to one run.
  presenter?: PresenterDef<TRow>;
};

/** Helper to check if output.table was called with a loader source */
export function isLoaderTable(
  opts: TableOutputStatic | TableOutputLoader,
): opts is TableOutputLoader {
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

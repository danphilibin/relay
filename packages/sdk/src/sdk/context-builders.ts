import {
  type InputSchema,
  type ButtonDef,
  type InputOptions,
  type ButtonLabels,
  type InputFieldDefinition,
  type InputFieldBuilder,
  type InputFieldBuilders,
  type TextFieldConfig,
  type NumberFieldConfig,
  type CheckboxFieldConfig,
  type SelectFieldConfig,
  compileInputFields,
} from "../isomorphic/input";
import {
  createInputRequest,
  createTableInputRequest,
  createLoadingMessage,
  createOutputMessage,
  createConfirmRequest,
  type StreamMessage,
} from "../isomorphic/messages";
import type { OutputBlock } from "../isomorphic/output";
import {
  type RowKeyValue,
  type LoaderTableData,
  normalizeCellValue,
  coerceRowKey,
} from "../isomorphic/table";
import { getWorkflow } from "./registry";
import type {
  RelayInputFn,
  RelayInputTableFn,
  RelayOutput,
  RelayLoadingFn,
  RelayConfirmFn,
} from "./cf-workflow";
import {
  type ColumnDef,
  type SerializedColumnDef,
  type TableInputSingle,
  type TableInputMultiple,
  type TableInputStaticSingle,
  type TableInputStaticMultiple,
  type TableOutputStatic,
  type TableOutputLoader,
  isLoaderTable,
  serializeColumns,
} from "./loader";

/**
 * Minimal step interface for the executor. Handlers use step.do() and
 * step.sleep(); waitForEvent is internal to the SDK's input/confirm wrappers.
 */
export type ExecutorStep = {
  do: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
  sleep: (name: string, duration: string | number) => Promise<void>;
  waitForEvent: (name: string, opts?: unknown) => Promise<{ payload: unknown }>;
};

export type EventNamePrefixes = "input" | "output" | "loading" | "confirm";

/**
 * Table descriptor — stored in DO storage so that later table query
 * requests can re-run the loader without encoding all state into the URL.
 */
export type TableDescriptor = {
  workflowSlug: string;
  loaderName: string;
  params: Record<string, unknown>;
  tableRendererName?: string;
  columns?: SerializedColumnDef[];
  pageSize?: number;
};

/**
 * Dependencies injected from the RelayExecutor into the context builder
 * functions. Keeps the builders decoupled from the Durable Object class
 * while giving them the minimum capabilities they need.
 */
export type ContextBuilderDeps = {
  /** Generate the next deterministic step name (e.g. "relay-input-0"). */
  stepName: (prefix: EventNamePrefixes) => string;
  /** Persist a message and broadcast it to connected stream clients. */
  appendMessage: (message: StreamMessage) => Promise<void>;
  /** DO storage handle — used to persist table descriptors. */
  storage: DurableObjectStorage;
  /** Worker env bindings — passed to loader resolve functions. */
  env: Env;
};

// ── Pure helpers ─────────────────────────────────────────────────────

/** Build the browser-facing table query path. */
function buildLoaderPath(runId: string, stepId: string): string {
  return `workflows/${runId}/table/${stepId}/query`;
}

function normalizeGroupArgs(
  titleOrFields: string | InputFieldBuilders,
  fieldsOrOptions?: InputFieldBuilders | InputOptions,
  maybeOptions?: InputOptions,
): {
  title: string;
  fields: InputFieldBuilders;
  options: InputOptions | undefined;
} {
  if (typeof titleOrFields === "string") {
    return {
      title: titleOrFields,
      fields: fieldsOrOptions as InputFieldBuilders,
      options: maybeOptions,
    };
  }

  return {
    title: "",
    fields: titleOrFields,
    options: fieldsOrOptions as InputOptions | undefined,
  };
}

/**
 * Normalize an array of source rows into the display-oriented LoaderTableData
 * shape. Used by static input.table — the same shape the loader HTTP endpoint
 * returns, so the client renders both modes identically.
 */
function normalizeStaticTableData<TRow>(
  data: TRow[],
  rowKey: string,
  columns?: ColumnDef<TRow>[],
): LoaderTableData {
  // Derive columns from the first row when none are specified.
  const normalizedColumns = columns
    ? columns.map((col, index) => {
        if (typeof col === "string") return { key: col, label: col };
        if ("accessorKey" in col)
          return { key: col.accessorKey, label: col.label };
        return { key: `render_${index}`, label: col.label };
      })
    : data[0]
      ? Object.keys(data[0] as Record<string, unknown>).map((key) => ({
          key,
          label: key,
        }))
      : [];

  return {
    columns: normalizedColumns,
    rows: data.map((row: any) => {
      const cells = Object.fromEntries(
        normalizedColumns.map((col, index) => {
          const srcCol = columns?.[index];
          let value: unknown;
          if (srcCol && typeof srcCol !== "string" && "renderCell" in srcCol) {
            value = srcCol.renderCell(row);
          } else {
            value = row[col.key];
          }
          return [col.key, normalizeCellValue(value)];
        }),
      );

      const typedKey = coerceRowKey(row[rowKey]);

      return { rowKey: typedKey, cells };
    }),
    totalCount: data.length,
  };
}

// ── Internal helpers (need deps) ─────────────────────────────────────

async function storeTableDescriptor(
  deps: ContextBuilderDeps,
  stepId: string,
  descriptor: TableDescriptor,
): Promise<void> {
  // Table descriptors are small durable records that let later table queries
  // re-run the loader without encoding display/source state into the URL.
  await deps.storage.put(`table:${stepId}`, descriptor);
}

async function requestSchemaInput<TPayload>(
  deps: ContextBuilderDeps,
  step: ExecutorStep,
  prompt: string,
  schema: InputSchema | undefined,
  buttons?: ButtonDef[],
  mapPayload?: (payload: Record<string, unknown>) => TPayload,
): Promise<TPayload> {
  const eventName = deps.stepName("input");

  await step.do(`${eventName}-request`, async () => {
    await deps.appendMessage(
      createInputRequest(eventName, prompt, schema, buttons),
    );
  });

  const event = await step.waitForEvent(eventName);
  const payload = event.payload as Record<string, unknown>;
  return mapPayload ? mapPayload(payload) : (payload as TPayload);
}

function createFieldBuilder<TValue, TDef extends InputFieldDefinition>(
  deps: ContextBuilderDeps,
  step: ExecutorStep,
  prompt: string,
  definition: TDef,
): InputFieldBuilder<TValue, TDef> {
  const execute = () =>
    requestSchemaInput(
      deps,
      step,
      prompt,
      { input: definition },
      undefined,
      (payload) => payload.input as TValue,
    );

  return {
    __relayFieldBuilder: true,
    definition,
    // oxlint-disable-next-line unicorn/no-thenable -- builders are intentionally awaitable
    then: (onfulfilled, onrejected) => execute().then(onfulfilled, onrejected),
  };
}

/**
 * Static input.table — all data travels inline in the input request.
 * Resolution is a simple filter against the original data array.
 */
async function handleStaticTableInput(
  deps: ContextBuilderDeps,
  step: ExecutorStep,
  opts: TableInputStaticSingle<any> | TableInputStaticMultiple<any>,
  selection: "single" | "multiple",
) {
  const { title, data, rowKey, pageSize, renderer } = opts;
  const columns = renderer?.columns ?? opts.columns;
  const eventName = deps.stepName("input");

  const normalizedData = normalizeStaticTableData(data, rowKey, columns);

  await step.do(`${eventName}-request`, async () => {
    await deps.appendMessage(
      createTableInputRequest(eventName, title, {
        type: "table",
        label: title,
        data: normalizedData,
        pageSize,
        rowKey,
        selection,
      }),
    );
  });

  const event = await step.waitForEvent(eventName);

  const payload = event.payload as Record<string, unknown>;
  const selectedKeys = payload.input as RowKeyValue[];

  // Resolve selected keys against the original data array — no loader
  // round-trip needed since the full dataset was provided inline.
  const rows = data.filter((row: any) => {
    const key = row[rowKey];
    return selectedKeys.some((k) => k === key || String(k) === String(key));
  });

  if (selection === "single") {
    return rows[0];
  }
  return rows;
}

/**
 * Loader-backed input.table — browser fetches pages via HTTP, and
 * selected row keys are resolved server-side through the loader's
 * `resolve` function.
 */
async function handleLoaderTableInput(
  deps: ContextBuilderDeps,
  step: ExecutorStep,
  workflowSlug: string,
  runId: string,
  opts: TableInputSingle<any> | TableInputMultiple<any>,
  selection: "single" | "multiple",
) {
  const { loader: loaderRef, title, pageSize, renderer } = opts;

  // rowKey comes from the loader definition, not the call site.
  const rowKey = loaderRef.rowKey;
  if (!rowKey) {
    throw new Error(
      `input.table() requires a loader with rowKey. ` +
        `Use the config-object form of loader() with rowKey and resolve.`,
    );
  }

  const columns = renderer?.columns ?? opts.columns;
  const serializedColumns = serializeColumns(columns);
  const eventName = deps.stepName("input");

  await step.do(`${eventName}-request`, async () => {
    await storeTableDescriptor(deps, eventName, {
      workflowSlug,
      loaderName: loaderRef.name,
      params: loaderRef.params,
      tableRendererName: renderer?.name,
      columns: serializedColumns,
      pageSize,
    });
    await deps.appendMessage(
      createTableInputRequest(eventName, title, {
        type: "table",
        label: title,
        loader: {
          path: buildLoaderPath(runId, eventName),
          pageSize,
        },
        rowKey,
        selection,
      }),
    );
  });

  const event = await step.waitForEvent(eventName);

  const payload = event.payload as Record<string, unknown>;
  const rowKeys = payload.input as RowKeyValue[];

  // Look up the loader definition to call its resolve function.
  const definition = getWorkflow(workflowSlug);
  const loaderDef = definition?.loaders?.[loaderRef.name];
  if (!loaderDef?.resolve) {
    throw new Error(
      `Loader "${loaderRef.name}" does not have a resolve function.`,
    );
  }

  // Resolve row keys to full source rows inside a step for durability.
  const rows = await step.do(`${eventName}-resolve`, async () => {
    return loaderDef.resolve!({ keys: rowKeys, ...loaderRef.params }, deps.env);
  });

  if (selection === "single") {
    return rows[0];
  }
  return rows;
}

// ── Public context builder functions ─────────────────────────────────

export function buildOutput(
  deps: ContextBuilderDeps,
  step: ExecutorStep,
  workflowSlug: string,
  runId: string,
): RelayOutput {
  const sendOutput = async (block: OutputBlock): Promise<void> => {
    const eventName = deps.stepName("output");
    await step.do(eventName, async () => {
      await deps.appendMessage(createOutputMessage(eventName, block));
    });
  };

  return {
    markdown: async (content) =>
      sendOutput({ type: "output.markdown", content }),
    table: async <TRow>(opts: TableOutputStatic | TableOutputLoader<TRow>) => {
      if (isLoaderTable(opts)) {
        const { loader: loaderRef, title, pageSize, renderer } = opts;
        // Table renderers own the display shape when provided; otherwise we fall back
        // to any inline columns passed directly to output.table().
        const columns = renderer?.columns ?? opts.columns;
        const serializedColumns = serializeColumns(columns);
        const stepId = deps.stepName("output");

        const block: OutputBlock = {
          type: "output.table_loader" as const,
          title,
          loader: {
            // The browser only gets a stable query endpoint. The DO stores the
            // descriptor needed to resolve and render this table later on.
            path: buildLoaderPath(runId, stepId),
            pageSize,
          },
        };

        await step.do(stepId, async () => {
          await storeTableDescriptor(deps, stepId, {
            workflowSlug,
            loaderName: loaderRef.name,
            params: loaderRef.params,
            tableRendererName: renderer?.name,
            columns: serializedColumns,
            pageSize,
          });
          await deps.appendMessage(createOutputMessage(stepId, block));
        });
      } else {
        await sendOutput({
          type: "output.table",
          title: opts.title,
          data: opts.data,
          pageSize: opts.pageSize,
        });
      }
    },
    code: async ({ code, language }) =>
      sendOutput({ type: "output.code", code, language }),
    image: async ({ src, alt }) =>
      sendOutput({ type: "output.image", src, alt }),
    link: async ({ url, title, description }) =>
      sendOutput({ type: "output.link", url, title, description }),
    buttons: async (buttons) => sendOutput({ type: "output.buttons", buttons }),
    metadata: async ({ title, data }) =>
      sendOutput({ type: "output.metadata", title, data }),
  };
}

export function buildInput(
  deps: ContextBuilderDeps,
  step: ExecutorStep,
  workflowSlug: string,
  runId: string,
): RelayInputFn {
  return Object.assign(
    async <const B extends readonly ButtonDef[]>(
      prompt: string,
      options?: InputOptions<B>,
    ) => {
      const buttons = options?.buttons as ButtonDef[] | undefined;

      if (!buttons) {
        return requestSchemaInput(
          deps,
          step,
          prompt,
          undefined,
          undefined,
          (payload) => payload.input as string,
        );
      }

      return requestSchemaInput(
        deps,
        step,
        prompt,
        undefined,
        buttons,
        (payload) =>
          ({
            value: payload.input,
            $choice: payload.$choice,
          }) as { value: string; $choice: ButtonLabels<B> },
      );
    },
    {
      table: (async (
        opts:
          | TableInputSingle<any>
          | TableInputMultiple<any>
          | TableInputStaticSingle<any>
          | TableInputStaticMultiple<any>,
      ) => {
        const isStatic = "data" in opts;
        const selection = opts.selection ?? "single";

        if (isStatic) {
          return handleStaticTableInput(deps, step, opts, selection);
        }

        return handleLoaderTableInput(
          deps,
          step,
          workflowSlug,
          runId,
          opts as TableInputSingle<any> | TableInputMultiple<any>,
          selection,
        );
      }) as RelayInputTableFn,

      text: (label: string, config: TextFieldConfig = {}) =>
        createFieldBuilder<
          string,
          Extract<InputFieldDefinition, { type: "text" }>
        >(deps, step, label, { type: "text", label, ...config }),

      checkbox: (label: string, config: CheckboxFieldConfig = {}) =>
        createFieldBuilder<
          boolean,
          Extract<InputFieldDefinition, { type: "checkbox" }>
        >(deps, step, label, {
          type: "checkbox",
          label,
          ...config,
        }),

      number: (label: string, config: NumberFieldConfig = {}) =>
        createFieldBuilder<
          number,
          Extract<InputFieldDefinition, { type: "number" }>
        >(deps, step, label, { type: "number", label, ...config }),

      select: <
        const TOptions extends readonly { value: string; label: string }[],
      >(
        label: string,
        config: Omit<
          SelectFieldConfig<TOptions[number]["value"]>,
          "options"
        > & {
          options: TOptions;
        },
      ) =>
        createFieldBuilder<
          TOptions[number]["value"],
          Extract<InputFieldDefinition, { type: "select" }>
        >(deps, step, label, {
          type: "select",
          label,
          ...config,
          options: [...config.options],
        }),

      group: async (
        titleOrFields: string | InputFieldBuilders,
        fieldsOrOptions?: InputFieldBuilders | InputOptions,
        maybeOptions?: InputOptions,
      ) => {
        const { title, fields, options } = normalizeGroupArgs(
          titleOrFields,
          fieldsOrOptions,
          maybeOptions,
        );
        const schema = compileInputFields(fields);
        return options
          ? requestSchemaInput(
              deps,
              step,
              title,
              schema,
              options.buttons as ButtonDef[],
            )
          : requestSchemaInput(deps, step, title, schema);
      },
    },
  ) as RelayInputFn;
}

export function buildLoading(
  deps: ContextBuilderDeps,
  step: ExecutorStep,
): RelayLoadingFn {
  return async (message, callback) => {
    const eventName = deps.stepName("loading");
    const startEventName = `${eventName}-start`;
    const completeEventName = `${eventName}-complete`;

    await step.do(startEventName, async () => {
      await deps.appendMessage(createLoadingMessage(eventName, message, false));
    });

    let completeMessage = message;

    // TODO: currently this runs unconditionally on every loading step;
    // should we also wrap this in a step.do?
    await callback({
      complete: (msg: string) => {
        completeMessage = msg;
      },
    });

    await step.do(completeEventName, async () => {
      await deps.appendMessage(
        createLoadingMessage(eventName, completeMessage, true),
      );
    });
  };
}

export function buildConfirm(
  deps: ContextBuilderDeps,
  step: ExecutorStep,
): RelayConfirmFn {
  return async (message: string): Promise<boolean> => {
    const eventName = deps.stepName("confirm");

    await step.do(`${eventName}-request`, async () => {
      await deps.appendMessage(createConfirmRequest(eventName, message));
    });

    const event = await step.waitForEvent(eventName);
    return (event.payload as { approved: boolean }).approved;
  };
}

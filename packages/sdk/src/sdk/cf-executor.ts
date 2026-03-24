import { DurableObject } from "cloudflare:workers";
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
  createWorkflowComplete,
  type StreamMessage,
} from "../isomorphic/messages";
import type { OutputBlock } from "../isomorphic/output";
import {
  type RowKeyValue,
  type LoaderTableData,
  normalizeCellValue,
} from "../isomorphic/table";
import { getWorkflow } from "./registry";
import type {
  RelayInputFn,
  RelayInputTableFn,
  RelayOutput,
  RelayLoadingFn,
  RelayConfirmFn,
  RelayContext,
} from "./cf-workflow";
import {
  type LoaderDef,
  type LoaderRef,
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

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Parse CF Workflow-style duration strings (e.g. "1 second", "5 minutes")
 * into milliseconds.
 */
function parseDurationToMs(duration: string | number): number {
  if (typeof duration === "number") return duration;
  const match = duration.match(/^(\d+)\s*(seconds?|minutes?|hours?)$/i);
  if (!match) return 0;
  const value = Number(match[1]);
  const unit = match[2].toLowerCase();
  if (unit.startsWith("second")) return value * 1000;
  if (unit.startsWith("minute")) return value * 60 * 1000;
  if (unit.startsWith("hour")) return value * 60 * 60 * 1000;
  return 0;
}

/**
 * Get the executor DO stub for a given run ID.
 */
export function getExecutorStub(env: Env, runId: string): DurableObjectStub {
  const doId = env.RELAY_EXECUTOR.idFromName(runId);
  return env.RELAY_EXECUTOR.get(doId);
}

// ── Internal types ───────────────────────────────────────────────────

/**
 * Minimal step interface for the executor. Handlers use step.do() and
 * step.sleep(); waitForEvent is internal to the SDK's input/confirm wrappers.
 */
export type ExecutorStep = {
  do: <T>(name: string, callback: () => Promise<T>) => Promise<T>;
  sleep: (name: string, duration: string | number) => Promise<void>;
  waitForEvent: (name: string, opts?: unknown) => Promise<{ payload: unknown }>;
};

type EventNamePrefixes = "input" | "output" | "loading" | "confirm";

/**
 * Thrown to unwind the handler call stack when the workflow needs to
 * wait for an external event (user input, confirmation, etc.).
 * On the next event arrival the handler replays from the top — cached
 * steps return instantly until execution reaches the new event.
 */
class SuspendExecution extends Error {
  constructor(public eventName: string) {
    super(`Suspended: waiting for event "${eventName}"`);
    this.name = "SuspendExecution";
  }
}

/**
 * Shape returned by the /start and /event endpoints so callers
 * (workflow-api.ts) know the execution state without consuming a stream.
 */
export type ExecutionResult = {
  status: "suspended" | "complete";
  pendingEvent?: string;
  messages: StreamMessage[];
};

/**
 * Table descriptor — stored in DO storage so that later table query
 * requests can re-run the loader without encoding all state into the URL.
 */
type TableDescriptor = {
  workflowSlug: string;
  loaderName: string;
  params: Record<string, unknown>;
  tableRendererName?: string;
  columns?: SerializedColumnDef[];
  pageSize?: number;
};

// ── Loader refs ─────────────────────────────────────────────────────

/**
 * Build loader refs for the handler context.
 * No-param loaders become bare LoaderRef objects.
 * Param loaders become functions that return LoaderRef with bound params.
 */
function buildLoaderRefs(
  loaderDefs?: Record<
    string,
    {
      fn: LoaderDef["fn"];
      paramDescriptor?: LoaderDef["paramDescriptor"];
      rowKey?: LoaderDef["rowKey"];
      resolve?: LoaderDef["resolve"];
    }
  >,
): Record<string, LoaderRef | ((params: any) => LoaderRef)> {
  if (!loaderDefs) return {};

  // Handlers get serializable loader handles rather than direct loader
  // callbacks. That keeps the workflow body ergonomic while deferring the
  // actual fetch to the HTTP layer later on.
  const refs: Record<string, LoaderRef | ((params: any) => LoaderRef)> = {};

  for (const [name, def] of Object.entries(loaderDefs)) {
    if (def.paramDescriptor && Object.keys(def.paramDescriptor).length > 0) {
      // Has custom params — return a function
      refs[name] = (params: Record<string, unknown>) =>
        ({
          __brand: "loader_ref" as const,
          __row: undefined as any,
          name,
          params,
          rowKey: def.rowKey,
        }) as LoaderRef;
    } else {
      // No custom params — return a bare ref
      refs[name] = {
        __brand: "loader_ref" as const,
        __row: undefined as any,
        name,
        params: {},
        rowKey: def.rowKey,
      } as LoaderRef;
    }
  }

  return refs;
}

// ── Durable Object ───────────────────────────────────────────────────

/**
 * Durable Object that owns workflow execution and the message stream.
 *
 * The workflow's handler runs as a normal async function inside the DO.
 * Step results are persisted in DO storage as `step:{name}` keys and streamed
 * via the NDJSON stream.
 *
 * When the handler waits for input, the DO suspends execution until the input
 * event is received. Input events replay the handler, skipping cached steps.
 *
 * Cloudflare Workflows have an execution delay in production (typically ~6s minimum)
 * so we implement our own lightweight durable function executor within the DO.
 */
export class RelayExecutor extends DurableObject<Env> {
  // ── Streaming state ──────────────────────────────────────────────
  private controllers: ReadableStreamDefaultController<Uint8Array>[] = [];

  // ── Execution state (reset at the top of every replay) ───────────
  private stepCache = new Map<string, unknown>();
  private counter = 0;

  // ── Router ───────────────────────────────────────────────────────

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // ── Streaming ──────────────────────────────────────────────────

    if (request.method === "GET" && url.pathname === "/stream") {
      return this.handleGetStream();
    }

    if (request.method === "POST" && url.pathname === "/stream") {
      const { message } = await request.json<{ message: StreamMessage }>();
      await this.appendMessage(message);
      return new Response("OK");
    }

    if (request.method === "GET" && url.pathname === "/metadata") {
      const slug = await this.getSlug();
      return Response.json({ slug: slug ?? null });
    }

    // ── Table descriptors ──────────────────────────────────────────

    const tableMatch = url.pathname.match(/^\/tables\/([^/]+)$/);

    // POST /tables/:id — store table descriptor for later queries
    if (request.method === "POST" && tableMatch) {
      const [, tableId] = tableMatch;
      const descriptor = await request.json<TableDescriptor>();
      await this.ctx.storage.put(`table:${tableId}`, descriptor);
      return new Response("OK");
    }

    // GET /tables/:id — retrieve stored table descriptor
    if (request.method === "GET" && tableMatch) {
      const [, tableId] = tableMatch;
      const descriptor = await this.ctx.storage.get<TableDescriptor>(
        `table:${tableId}`,
      );

      if (!descriptor) {
        return Response.json(
          { error: `Unknown table descriptor: ${tableId}` },
          { status: 404 },
        );
      }

      return Response.json(descriptor);
    }

    // ── Execution ──────────────────────────────────────────────────

    // POST /start  — begin a new workflow run
    if (request.method === "POST" && url.pathname === "/start") {
      const { slug, runId, data } = await request.json<{
        slug: string;
        runId: string;
        data?: Record<string, unknown>;
      }>();

      await this.ctx.storage.put("slug", slug);
      await this.ctx.storage.put("runId", runId);
      if (data !== undefined) {
        await this.ctx.storage.put("prefilled", data);
      }

      const result = await this.replay();
      return Response.json(result);
    }

    // POST /event/:name — deliver an external event then replay
    const eventMatch = url.pathname.match(/^\/event\/([^/]+)$/);
    if (request.method === "POST" && eventMatch) {
      const [, eventName] = eventMatch;
      const payload = await request.json();

      // TODO: Validate that this event matches the workflow's current pending
      // interaction before persisting it. Right now any client can pre-seed
      // deterministic future event names and the replay will consume them later.
      // Persist the event so the next replay can pick it up
      await this.ctx.storage.put(`event:${eventName}`, payload);

      const result = await this.replay();
      return Response.json(result);
    }

    return new Response("Not found", { status: 404 });
  }

  async alarm(): Promise<void> {
    const pending = await this.ctx.storage.list({ prefix: "sleep_pending:" });

    for (const [pendingKey] of pending) {
      const name = pendingKey.slice("sleep_pending:".length);
      await this.ctx.storage.put(`step:${name}`, { v: undefined });
      await this.ctx.storage.delete(pendingKey);
    }

    await this.replay();
  }

  // ── Streaming helpers ────────────────────────────────────────────

  private handleGetStream(): Response {
    let streamController: ReadableStreamDefaultController<Uint8Array>;

    const stream = new ReadableStream({
      start: async (controller) => {
        streamController = controller;

        // TODO: Make "send stored history + attach live subscriber" atomic.
        // Today there is a race where appendMessage() can persist and
        // broadcast a new message after we read messages from storage but
        // before this controller is registered. In that case this subscriber
        // misses the message entirely: it was not in the stored history we sent and
        // it was not delivered live. That can leave browser clients with a
        // gap in the event log and can cause the blocking call-response API
        // to hang or misread run state because it also consumes this stream.
        const messages = await this.getMessages();

        for (const message of messages) {
          const encoded = new TextEncoder().encode(
            JSON.stringify(message) + "\n",
          );
          controller.enqueue(encoded);
        }

        this.controllers.push(controller);
      },
      cancel: () => {
        const index = this.controllers.indexOf(streamController);
        if (index > -1) {
          this.controllers.splice(index, 1);
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "application/x-ndjson",
        "Cache-Control": "no-cache",
      },
    });
  }

  /**
   * Persist a message and broadcast it to all connected streaming clients.
   */
  private async appendMessage(message: StreamMessage): Promise<void> {
    const messages = await this.getMessages();

    messages.push(message);

    await this.ctx.storage.put("messages", messages);

    const encoded = new TextEncoder().encode(JSON.stringify(message) + "\n");

    for (const controller of this.controllers) {
      try {
        controller.enqueue(encoded);
      } catch {
        // Controller may already be closed — ignore
      }
    }
  }

  // ── Replay engine ────────────────────────────────────────────────

  /**
   * Populate the in-memory cache with all previously completed steps
   * and received events so the replay can skip past them.
   *
   * Step results are stored wrapped as { v: result } because DO storage
   * rejects undefined values, but step.do callbacks that return void
   * produce undefined. The wrapper lets us distinguish "step completed
   * with undefined" from "step not yet executed" using Map.has().
   */
  private async loadCache(): Promise<void> {
    this.stepCache.clear();

    const stepEntries = await this.ctx.storage.list({ prefix: "step:" });
    for (const [key, value] of stepEntries) {
      // Unwrap the { v: ... } container written by step.do
      this.stepCache.set(key, (value as { v: unknown }).v);
    }

    const eventEntries = await this.ctx.storage.list({ prefix: "event:" });
    for (const [key, value] of eventEntries) {
      this.stepCache.set(key, value);
    }
  }

  /**
   * (Re-)run the workflow handler from the beginning.
   *
   * Previously completed step.do() calls return their cached result
   * immediately; previously received events satisfy waitForEvent()
   * without suspending.  Execution proceeds until the handler either
   * completes or hits a waitForEvent for an event that hasn't arrived
   * yet (which throws SuspendExecution to park the workflow).
   */
  private async replay(): Promise<ExecutionResult> {
    await this.loadCache();
    this.counter = 0;

    const slug = await this.getSlug();
    const runId = await this.getRunId();
    const prefilled = await this.getPrefilled();

    if (!slug) throw new Error("No workflow slug set");
    if (!runId) throw new Error("No run ID set");

    const definition = getWorkflow(slug);
    if (!definition) throw new Error(`Unknown workflow: ${slug}`);

    const step = this.createStep();

    // ── Run the handler ────────────────────────────────────────────
    try {
      // ── Upfront input (schema defined on createWorkflow) ───────────
      let data: Record<string, unknown> | undefined;
      if (definition.input) {
        if (prefilled) {
          data = prefilled;
        } else {
          const eventName = this.stepName("input");

          await step.do(`${eventName}-request`, async () => {
            await this.appendMessage(
              createInputRequest(eventName, definition.title, definition.input),
            );
          });

          const response = await step.waitForEvent(eventName);
          data = response.payload as Record<string, unknown>;
        }
      }

      // Build loader refs for the handler context
      const loaderRefs = buildLoaderRefs(definition.loaders as any);

      await definition.handler({
        step,
        input: this.buildInput(step, slug, runId),
        output: this.buildOutput(step, slug, runId),
        loading: this.buildLoading(step),
        confirm: this.buildConfirm(step),
        loaders: loaderRefs,
        ...(data !== undefined && { data }),
      } as RelayContext);

      // Handler returned normally — workflow is complete
      await step.do("relay-workflow-complete", async () => {
        await this.appendMessage(
          createWorkflowComplete("relay-workflow-complete"),
        );
      });

      const messages = await this.getMessages();

      return { status: "complete", messages };
    } catch (e) {
      if (e instanceof SuspendExecution) {
        const messages = await this.getMessages();
        return {
          status: "suspended",
          pendingEvent: e.eventName,
          messages,
        };
      }
      throw e;
    }
  }

  // ── Storage ──────────────────────────────────────────
  private async getSlug(): Promise<string | undefined> {
    return await this.ctx.storage.get<string>("slug");
  }

  private async getRunId(): Promise<string | undefined> {
    return await this.ctx.storage.get<string>("runId");
  }

  private async getPrefilled(): Promise<Record<string, unknown> | undefined> {
    return await this.ctx.storage.get<Record<string, unknown>>("prefilled");
  }

  private async getMessages(): Promise<StreamMessage[]> {
    return (await this.ctx.storage.get<StreamMessage[]>("messages")) || [];
  }

  // ── Step implementation ──────────────────────────────────────────

  private createStep(): ExecutorStep {
    return {
      do: async <T>(name: string, callback: () => Promise<T>): Promise<T> => {
        const cacheKey = `step:${name}`;

        if (this.stepCache.has(cacheKey)) {
          return this.stepCache.get(cacheKey) as T;
        }

        const result = await callback();
        this.stepCache.set(cacheKey, result);
        // Wrap in { v: ... } because DO storage rejects undefined values
        await this.ctx.storage.put(cacheKey, { v: result });
        return result;
      },

      sleep: async (name: string, duration: string | number): Promise<void> => {
        const cacheKey = `step:${name}`;
        const pendingKey = `sleep_pending:${name}`;

        if (this.stepCache.has(cacheKey)) {
          return; // Already slept on a previous replay
        }

        const pendingAt = await this.ctx.storage.get<number>(pendingKey);
        if (!pendingAt) {
          const ms = parseDurationToMs(duration);
          const wakeAt = Date.now() + ms;

          await this.ctx.storage.put(pendingKey, wakeAt);
          await this.ctx.storage.setAlarm(wakeAt);
        }

        throw new SuspendExecution(cacheKey);
      },

      waitForEvent: async (
        name: string,
        _opts?: unknown,
      ): Promise<{ payload: unknown }> => {
        const cacheKey = `event:${name}`;

        if (this.stepCache.has(cacheKey)) {
          return { payload: this.stepCache.get(cacheKey) };
        }

        // Event hasn't arrived yet — suspend execution
        throw new SuspendExecution(name);
      },
    };
  }

  // ── Deterministic step-name counter ──────────────────────────────

  private stepName(prefix: EventNamePrefixes): string {
    return `relay-${prefix}-${this.counter++}`;
  }

  // ── Table helpers ────────────────────────────────────────────────

  // Build the browser-facing table query path. The browser only needs a stable
  // table resource identifier; the DO holds the loader/display descriptor.
  private buildLoaderPath(runId: string, stepId: string): string {
    return `workflows/${runId}/table/${stepId}/query`;
  }

  private async storeTableDescriptor(
    stepId: string,
    descriptor: TableDescriptor,
  ): Promise<void> {
    // Table descriptors are small durable records that let later table queries
    // re-run the loader without encoding display/source state into the URL.
    await this.ctx.storage.put(`table:${stepId}`, descriptor);
  }

  /**
   * Normalize an array of source rows into the display-oriented LoaderTableData
   * shape. Used by static input.table — the same shape the loader HTTP endpoint
   * returns, so the client renders both modes identically.
   */
  private normalizeStaticTableData<TRow>(
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
            if (
              srcCol &&
              typeof srcCol !== "string" &&
              "renderCell" in srcCol
            ) {
              value = srcCol.renderCell(row);
            } else {
              value = row[col.key];
            }
            return [col.key, normalizeCellValue(value)];
          }),
        );

        const rawKey = row[rowKey];
        const typedKey =
          typeof rawKey === "string" || typeof rawKey === "number"
            ? rawKey
            : rawKey != null
              ? String(rawKey)
              : undefined;

        return { rowKey: typedKey, cells };
      }),
      totalCount: data.length,
    };
  }

  // ── Context builders ─────────────────────────────────────────────

  private buildOutput(
    step: ExecutorStep,
    workflowSlug: string,
    runId: string,
  ): RelayOutput {
    const sendOutput = async (block: OutputBlock): Promise<void> => {
      const eventName = this.stepName("output");
      await step.do(eventName, async () => {
        await this.appendMessage(createOutputMessage(eventName, block));
      });
    };

    return {
      markdown: async (content) =>
        sendOutput({ type: "output.markdown", content }),
      table: async <TRow>(
        opts: TableOutputStatic | TableOutputLoader<TRow>,
      ) => {
        if (isLoaderTable(opts)) {
          const { loader: loaderRef, title, pageSize, renderer } = opts;
          // Table renderers own the display shape when provided; otherwise we fall back
          // to any inline columns passed directly to output.table().
          const columns = renderer?.columns ?? opts.columns;
          const serializedColumns = serializeColumns(columns);
          const stepId = this.stepName("output");

          const block: OutputBlock = {
            type: "output.table_loader" as const,
            title,
            loader: {
              // The browser only gets a stable query endpoint. The DO stores the
              // descriptor needed to resolve and render this table later on.
              path: this.buildLoaderPath(runId, stepId),
              pageSize,
            },
          };

          await step.do(stepId, async () => {
            await this.storeTableDescriptor(stepId, {
              workflowSlug,
              loaderName: loaderRef.name,
              params: loaderRef.params,
              tableRendererName: renderer?.name,
              columns: serializedColumns,
              pageSize,
            });
            await this.appendMessage(createOutputMessage(stepId, block));
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
      buttons: async (buttons) =>
        sendOutput({ type: "output.buttons", buttons }),
      metadata: async ({ title, data }) =>
        sendOutput({ type: "output.metadata", title, data }),
    };
  }

  // ── Input ────────────────────────────────────────────────────────

  private async requestSchemaInput<TPayload>(
    step: ExecutorStep,
    prompt: string,
    schema: InputSchema | undefined,
    buttons?: ButtonDef[],
    mapPayload?: (payload: Record<string, unknown>) => TPayload,
  ): Promise<TPayload> {
    const eventName = this.stepName("input");

    await step.do(`${eventName}-request`, async () => {
      await this.appendMessage(
        createInputRequest(eventName, prompt, schema, buttons),
      );
    });

    const event = await step.waitForEvent(eventName);
    const payload = event.payload as Record<string, unknown>;
    return mapPayload ? mapPayload(payload) : (payload as TPayload);
  }

  private createFieldBuilder<TValue, TDef extends InputFieldDefinition>(
    step: ExecutorStep,
    prompt: string,
    definition: TDef,
  ): InputFieldBuilder<TValue, TDef> {
    const execute = () =>
      this.requestSchemaInput(
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
      then: (onfulfilled, onrejected) =>
        execute().then(onfulfilled, onrejected),
    };
  }

  private normalizeGroupArgs(
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
   * Static input.table — all data travels inline in the input request.
   * Resolution is a simple filter against the original data array.
   */
  private async handleStaticTableInput(
    step: ExecutorStep,
    opts: TableInputStaticSingle<any> | TableInputStaticMultiple<any>,
    selection: "single" | "multiple",
  ) {
    const { title, data, rowKey, pageSize, renderer } = opts;
    const columns = renderer?.columns ?? opts.columns;
    const eventName = this.stepName("input");

    const normalizedData = this.normalizeStaticTableData(data, rowKey, columns);

    await step.do(`${eventName}-request`, async () => {
      await this.appendMessage(
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
  private async handleLoaderTableInput(
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
    const eventName = this.stepName("input");

    await step.do(`${eventName}-request`, async () => {
      await this.storeTableDescriptor(eventName, {
        workflowSlug,
        loaderName: loaderRef.name,
        params: loaderRef.params,
        tableRendererName: renderer?.name,
        columns: serializedColumns,
        pageSize,
      });
      await this.appendMessage(
        createTableInputRequest(eventName, title, {
          type: "table",
          label: title,
          loader: {
            path: this.buildLoaderPath(runId, eventName),
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
      return loaderDef.resolve!(
        { keys: rowKeys, ...loaderRef.params },
        this.env,
      );
    });

    if (selection === "single") {
      return rows[0];
    }
    return rows;
  }

  private buildInput(
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
          return this.requestSchemaInput(
            step,
            prompt,
            undefined,
            undefined,
            (payload) => payload.input as string,
          );
        }

        return this.requestSchemaInput(
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
            return this.handleStaticTableInput(step, opts, selection);
          }

          return this.handleLoaderTableInput(
            step,
            workflowSlug,
            runId,
            opts as TableInputSingle<any> | TableInputMultiple<any>,
            selection,
          );
        }) as RelayInputTableFn,

        text: (label: string, config: TextFieldConfig = {}) =>
          this.createFieldBuilder<
            string,
            Extract<InputFieldDefinition, { type: "text" }>
          >(step, label, { type: "text", label, ...config }),

        checkbox: (label: string, config: CheckboxFieldConfig = {}) =>
          this.createFieldBuilder<
            boolean,
            Extract<InputFieldDefinition, { type: "checkbox" }>
          >(step, label, {
            type: "checkbox",
            label,
            ...config,
          }),

        number: (label: string, config: NumberFieldConfig = {}) =>
          this.createFieldBuilder<
            number,
            Extract<InputFieldDefinition, { type: "number" }>
          >(step, label, { type: "number", label, ...config }),

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
          this.createFieldBuilder<
            TOptions[number]["value"],
            Extract<InputFieldDefinition, { type: "select" }>
          >(step, label, {
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
          const { title, fields, options } = this.normalizeGroupArgs(
            titleOrFields,
            fieldsOrOptions,
            maybeOptions,
          );
          const schema = compileInputFields(fields);
          return options
            ? this.requestSchemaInput(
                step,
                title,
                schema,
                options.buttons as ButtonDef[],
              )
            : this.requestSchemaInput(step, title, schema);
        },
      },
    ) as RelayInputFn;
  }

  // ── Loading ──────────────────────────────────────────────────────

  private buildLoading(step: ExecutorStep): RelayLoadingFn {
    return async (message, callback) => {
      const eventName = this.stepName("loading");
      const startEventName = `${eventName}-start`;
      const completeEventName = `${eventName}-complete`;

      await step.do(startEventName, async () => {
        await this.appendMessage(
          createLoadingMessage(eventName, message, false),
        );
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
        await this.appendMessage(
          createLoadingMessage(eventName, completeMessage, true),
        );
      });
    };
  }

  // ── Confirm ──────────────────────────────────────────────────────

  private buildConfirm(step: ExecutorStep): RelayConfirmFn {
    return async (message: string): Promise<boolean> => {
      const eventName = this.stepName("confirm");

      await step.do(`${eventName}-request`, async () => {
        await this.appendMessage(createConfirmRequest(eventName, message));
      });

      const event = await step.waitForEvent(eventName);
      return (event.payload as { approved: boolean }).approved;
    };
  }
}

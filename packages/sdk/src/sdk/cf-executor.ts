import { DurableObject } from "cloudflare:workers";
import {
  createInputRequest,
  createWorkflowComplete,
  type StreamMessage,
} from "../isomorphic/messages";
import { getWorkflow } from "./registry";
import type { RelayContext } from "./cf-workflow";
import type { LoaderDef, LoaderRef } from "./loader";
import {
  type ExecutorStep,
  type EventNamePrefixes,
  type TableDescriptor,
  type ContextBuilderDeps,
  buildInput,
  buildOutput,
  buildLoading,
  buildConfirm,
} from "./context-builders";

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

    // Deps bridge: gives context builders access to DO capabilities
    // without coupling them to the DurableObject class.
    const deps: ContextBuilderDeps = {
      stepName: (prefix) => this.stepName(prefix),
      appendMessage: (msg) => this.appendMessage(msg),
      storage: this.ctx.storage,
      env: this.env,
    };

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
        input: buildInput(deps, step, slug, runId),
        output: buildOutput(deps, step, slug, runId),
        loading: buildLoading(deps, step),
        confirm: buildConfirm(deps, step),
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
}

import { DurableObject } from "cloudflare:workers";
import {
  type InputSchema,
  type ButtonDef,
  type InputOptions,
  type ButtonLabels,
  type RelayInputFn,
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
  createLoadingMessage,
  createOutputMessage,
  createConfirmRequest,
  createWorkflowComplete,
  type StreamMessage,
} from "../isomorphic/messages";
import type { OutputBlock } from "../isomorphic/output";
import { getWorkflow } from "./registry";
import type {
  RelayOutput,
  RelayLoadingFn,
  RelayConfirmFn,
  RelayContext,
} from "./cf-workflow";

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

    // ── Execution ──────────────────────────────────────────────────

    // POST /start  — begin a new workflow run
    if (request.method === "POST" && url.pathname === "/start") {
      const { slug, data } = await request.json<{
        slug: string;
        data?: Record<string, unknown>;
      }>();

      await this.ctx.storage.put("slug", slug);
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
    const prefilled = await this.getPrefilled();

    if (!slug) throw new Error("No workflow slug set");

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

      await definition.handler({
        step,
        input: this.buildInput(step),
        output: this.buildOutput(step),
        loading: this.buildLoading(step),
        confirm: this.buildConfirm(step),
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

  // ── Context builders ─────────────────────────────────────────────

  private buildOutput(step: ExecutorStep): RelayOutput {
    const sendOutput = async (block: OutputBlock): Promise<void> => {
      const eventName = this.stepName("output");
      await step.do(eventName, async () => {
        await this.appendMessage(createOutputMessage(eventName, block));
      });
    };

    return {
      markdown: async (content) =>
        sendOutput({ type: "output.markdown", content }),
      table: async ({ title, data }) =>
        sendOutput({ type: "output.table", title, data }),
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

  private buildInput(step: ExecutorStep): RelayInputFn {
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

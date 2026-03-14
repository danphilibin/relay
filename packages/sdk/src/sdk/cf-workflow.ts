import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";
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
  type InferBuilderGroupResult,
} from "../isomorphic/input";
import {
  createInputRequest,
  createLoadingMessage,
  createOutputMessage,
  createConfirmRequest,
  createWorkflowComplete,
  type StreamMessage,
} from "../isomorphic/messages";
import type { OutputBlock, OutputButtonDef } from "../isomorphic/output";
import { getWorkflow, registerWorkflow } from "./registry";
import type { WorkflowParams } from "../isomorphic/registry-types";

/**
 * Context passed to the loading callback
 */
export type LoadingContext = {
  complete: (message: string) => void;
};

/**
 * Loading function type
 */
export type RelayLoadingFn = (
  message: string,
  callback: (ctx: LoadingContext) => Promise<void>,
) => Promise<void>;

/**
 * Confirm function type - prompts user for approval
 */
export type RelayConfirmFn = (message: string) => Promise<boolean>;

export type RelayOutput = {
  markdown: (content: string) => Promise<void>;
  table: (table: {
    title?: string;
    data: Array<Record<string, string>>;
  }) => Promise<void>;
  code: (content: { code: string; language?: string }) => Promise<void>;
  image: (opts: { src: string; alt?: string }) => Promise<void>;
  link: (opts: {
    url: string;
    title?: string;
    description?: string;
  }) => Promise<void>;
  buttons: (buttons: OutputButtonDef[]) => Promise<void>;
  metadata: (opts: {
    title?: string;
    data: Record<string, string | number | boolean | null>;
  }) => Promise<void>;
};

/**
 * Context passed to workflow handlers.
 * Use `input`, `output`, `loading`, and `confirm` to interact with the user.
 */
export type RelayContext = {
  step: WorkflowStep;
  input: RelayInputFn;
  output: RelayOutput;
  loading: RelayLoadingFn;
  confirm: RelayConfirmFn;
};

export type RelayHandler = (ctx: RelayContext) => Promise<void>;

/**
 * Factory function for creating and registering workflow handlers.
 * When `input` is provided, the handler receives typed `data` with the collected values.
 */
export function createWorkflow<T extends InputFieldBuilders>(config: {
  name: string;
  description?: string;
  input: T;
  handler: (
    ctx: RelayContext & { data: InferBuilderGroupResult<T> },
  ) => Promise<void>;
}): void;
export function createWorkflow(config: {
  name: string;
  description?: string;
  handler: RelayHandler;
}): void;
export function createWorkflow(config: {
  name: string;
  description?: string;
  input?: InputFieldBuilders;
  handler: (...args: any[]) => Promise<void>;
}): void {
  registerWorkflow(
    config.name,
    config.handler as RelayHandler,
    config.input ? compileInputFields(config.input) : undefined,
    config.description,
  );
}

/**
 * Workflow entrypoint class that handles the workflow lifecycle.
 * All workflow functions run through this class.
 */
export class RelayWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  protected step: WorkflowStep | null = null;

  // Each workflow run gets a Durable Object named using workflow's instance ID
  protected stream: DurableObjectStub | null = null;

  // Counter for generating unique step names
  private counter = 0;

  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    this.step = step;

    this.stream = this.env.RELAY_DURABLE_OBJECT.getByName(event.instanceId);

    const { name, data: prefilled } = event.payload;
    const definition = getWorkflow(name);

    if (!definition) {
      await this.output.markdown(`Error: Unknown workflow: ${name}`);
      throw new Error(`Unknown workflow: ${name}`);
    }

    // Collect upfront input if schema is defined
    let data: Record<string, unknown> | undefined;
    if (definition.input) {
      if (prefilled) {
        data = prefilled;
      } else {
        // Emit input_request and wait for response
        const eventName = this.stepName("input");

        await step.do(`${eventName}-request`, async () => {
          await this.sendMessage(
            createInputRequest(eventName, definition.title, definition.input),
          );
        });

        const response = await step.waitForEvent(eventName, {
          type: eventName,
          timeout: "5 minutes",
        });

        data = response.payload as Record<string, unknown>;
      }
    }

    await definition.handler({
      step,
      input: this.input,
      output: this.output,
      loading: this.loading,
      confirm: this.confirm,
      ...(data !== undefined && { data }),
    } as RelayContext);

    // Signal that the workflow has completed
    await step.do("relay-workflow-complete", async () => {
      await this.sendMessage(createWorkflowComplete("relay-workflow-complete"));
    });
  }

  private async sendMessage(message: StreamMessage): Promise<void> {
    if (!this.stream) {
      throw new Error("Relay not initialized. Call initRelay() first.");
    }

    await this.stream.fetch("http://internal/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  }

  private stepName(prefix: string): string {
    return `relay-${prefix}-${this.counter++}`;
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

  private createFieldBuilder<TValue, TDef extends InputFieldDefinition>(
    prompt: string,
    definition: TDef,
  ): InputFieldBuilder<TValue, TDef> {
    const execute = () =>
      this.requestSchemaInput(
        prompt,
        { input: definition },
        undefined,
        (payload) => payload.input as TValue,
      );

    return {
      __relayFieldBuilder: true,
      definition,
      // oxlint-disable-next-line unicorn/no-thenable -- builders are intentionally awaitable so the same API works for simple fields and groups
      then: (onfulfilled, onrejected) =>
        execute().then(onfulfilled, onrejected),
    };
  }

  private async requestSchemaInput<TPayload>(
    prompt: string,
    schema: InputSchema | undefined,
    buttons?: ButtonDef[],
    mapPayload?: (payload: Record<string, unknown>) => TPayload,
  ): Promise<TPayload> {
    if (!this.step) {
      throw new Error("Relay not initialized. Call initRelay() first.");
    }

    const eventName = this.stepName("input");

    await this.step.do(`${eventName}-request`, async () => {
      await this.sendMessage(
        createInputRequest(eventName, prompt, schema, buttons),
      );
    });

    const event = await this.step.waitForEvent(eventName, {
      type: eventName,
      timeout: "5 minutes",
    });

    const payload = event.payload as Record<string, unknown>;
    return mapPayload ? mapPayload(payload) : (payload as TPayload);
  }

  private async sendOutput(block: OutputBlock): Promise<void> {
    if (!this.step) {
      throw new Error("Relay not initialized. Call initRelay() first.");
    }

    const eventName = this.stepName("output");

    await this.step.do(eventName, async () => {
      await this.sendMessage(createOutputMessage(eventName, block));
    });
  }

  /**
   * Output rich blocks to the workflow stream.
   */
  output: RelayOutput = {
    markdown: async (content: string) => {
      await this.sendOutput({ type: "output.markdown", content });
    },
    table: async ({ title, data }) => {
      await this.sendOutput({ type: "output.table", title, data });
    },
    code: async ({ code, language }) => {
      await this.sendOutput({ type: "output.code", code, language });
    },
    image: async ({ src, alt }) => {
      await this.sendOutput({ type: "output.image", src, alt });
    },
    link: async ({ url, title, description }) => {
      await this.sendOutput({ type: "output.link", url, title, description });
    },
    buttons: async (buttons) => {
      await this.sendOutput({ type: "output.buttons", buttons });
    },
    metadata: async ({ title, data }) => {
      await this.sendOutput({ type: "output.metadata", title, data });
    },
  };

  /**
   * Request input from the user and wait for a response.
   */
  input: RelayInputFn = Object.assign(
    async <const B extends readonly ButtonDef[]>(
      prompt: string,
      options?: InputOptions<B>,
    ) => {
      const buttons = options?.buttons as ButtonDef[] | undefined;

      if (!buttons) {
        return this.requestSchemaInput(
          prompt,
          undefined,
          undefined,
          (payload) => payload.input as string,
        );
      }

      return this.requestSchemaInput(
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
        >(label, { type: "text", label, ...config }),
      checkbox: (label: string, config: CheckboxFieldConfig = {}) =>
        this.createFieldBuilder<
          boolean,
          Extract<InputFieldDefinition, { type: "checkbox" }>
        >(label, {
          type: "checkbox",
          label,
          ...config,
        }),
      number: (label: string, config: NumberFieldConfig = {}) =>
        this.createFieldBuilder<
          number,
          Extract<InputFieldDefinition, { type: "number" }>
        >(label, { type: "number", label, ...config }),
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
        >(label, {
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
              title,
              schema,
              options.buttons as ButtonDef[],
            )
          : this.requestSchemaInput(title, schema);
      },
    },
  ) as RelayInputFn;

  /**
   * Show a loading indicator while performing async work.
   * Call `complete()` in the callback to update the message when done.
   */
  loading: RelayLoadingFn = async (message, callback) => {
    if (!this.step) {
      throw new Error("Relay not initialized. Call initRelay() first.");
    }

    const eventName = this.stepName("loading");
    const startEventName = `${eventName}-start`;
    const completeEventName = `${eventName}-complete`;

    // Note: we send the base `eventName` as the ID in both the start and complete
    // events so the UI can progressively update the loading status

    // Send loading start inside a step (idempotent on replay)
    await this.step.do(startEventName, async () => {
      await this.sendMessage(createLoadingMessage(eventName, message, false));
    });

    // Track the completion message
    let completeMessage = message;

    // Execute the callback
    await callback({
      complete: (msg: string) => {
        completeMessage = msg;
      },
    });

    // Send loading complete inside a step (idempotent on replay)
    await this.step.do(completeEventName, async () => {
      await this.sendMessage(
        createLoadingMessage(eventName, completeMessage, true),
      );
    });
  };

  /**
   * Request confirmation from the user (approve/reject).
   * Returns true if approved, false if rejected.
   */
  confirm: RelayConfirmFn = async (message: string): Promise<boolean> => {
    if (!this.step) {
      throw new Error("Relay not initialized. Call initRelay() first.");
    }

    const eventName = this.stepName("confirm");

    await this.step.do(`${eventName}-request`, async () => {
      await this.sendMessage(createConfirmRequest(eventName, message));
    });

    const event = await this.step.waitForEvent(eventName, {
      type: eventName,
      timeout: "5 minutes",
    });

    return (event.payload as { approved: boolean }).approved;
  };
}

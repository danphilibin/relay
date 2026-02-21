import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";
import {
  type InputSchema,
  type InferInputResult,
  type ButtonDef,
  type InputOptions,
  type RelayInputFn,
} from "@/isomorphic/input";
import {
  createInputRequest,
  createLoadingMessage,
  createLogMessage,
  createConfirmRequest,
  createWorkflowComplete,
  type StreamMessage,
} from "@/isomorphic/messages";
import { getWorkflow, registerWorkflow } from "./registry";
import type { WorkflowParams } from "@/isomorphic/registry-types";

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

/**
 * Context passed to workflow handlers.
 * Use `input`, `output`, `loading`, and `confirm` to interact with the user.
 */
export type RelayContext = {
  step: WorkflowStep;
  input: RelayInputFn;
  output: RelayWorkflow["output"];
  loading: RelayLoadingFn;
  confirm: RelayConfirmFn;
};

export type RelayHandler = (ctx: RelayContext) => Promise<void>;

/**
 * Factory function for creating and registering workflow handlers.
 * When `input` is provided, the handler receives typed `data` with the collected values.
 */
export function createWorkflow<T extends InputSchema>(config: {
  name: string;
  description?: string;
  input: T;
  handler: (ctx: RelayContext & { data: InferInputResult<T> }) => Promise<void>;
}): void;
export function createWorkflow(config: {
  name: string;
  description?: string;
  handler: RelayHandler;
}): void;
export function createWorkflow(config: {
  name: string;
  description?: string;
  input?: InputSchema;
  handler: (...args: any[]) => Promise<void>;
}): void {
  registerWorkflow(
    config.name,
    config.handler as RelayHandler,
    config.input,
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
      await this.output(`Error: Unknown workflow: ${name}`);
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

  private normalizeInputArgs(
    schemaOrOptions?: InputSchema | InputOptions,
    maybeOptions?: InputOptions,
  ): {
    schema: InputSchema | undefined;
    options: InputOptions | undefined;
    buttons: ButtonDef[] | undefined;
  } {
    const isOptions = (v: unknown): v is InputOptions =>
      typeof v === "object" && v !== null && "buttons" in v;

    const schema = isOptions(schemaOrOptions) ? undefined : schemaOrOptions;
    const options = isOptions(schemaOrOptions) ? schemaOrOptions : maybeOptions;
    const buttons = options?.buttons as ButtonDef[] | undefined;

    return { schema, options, buttons };
  }

  /**
   * Output a message to the workflow stream.
   */
  output = async (text: string): Promise<void> => {
    if (!this.step) {
      throw new Error("Relay not initialized. Call initRelay() first.");
    }

    const eventName = this.stepName("output");

    await this.step.do(eventName, async () => {
      await this.sendMessage(createLogMessage(eventName, text));
    });
  };

  /**
   * Request input from the user and wait for a response.
   */
  input: RelayInputFn = (async (
    prompt: string,
    schemaOrOptions?: InputSchema | InputOptions,
    maybeOptions?: InputOptions,
  ) => {
    if (!this.step) {
      throw new Error("Relay not initialized. Call initRelay() first.");
    }

    const { schema, buttons } = this.normalizeInputArgs(
      schemaOrOptions,
      maybeOptions,
    );

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

    // With buttons: always return object (with $choice)
    if (buttons) {
      if (!schema) {
        return { value: payload.input, $choice: payload.$choice };
      }
      return payload;
    }

    // No buttons: unwrap simple case
    if (!schema) {
      return payload.input;
    }

    return payload;
  }) as RelayInputFn;

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

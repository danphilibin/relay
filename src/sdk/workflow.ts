import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";
import { workflows } from "../registry";
import {
  createInputRequest,
  createLoadingMessage,
  createLogMessage,
  type StreamMessage,
  type InputSchema,
  type InferInputResult,
  type WorkflowParams,
} from "./stream";

/**
 * Input function type with overloads for simple and structured inputs
 */
export type RelayInputFn = {
  (prompt: string): Promise<string>;
  <T extends InputSchema>(
    prompt: string,
    schema: T,
  ): Promise<InferInputResult<T>>;
};

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
 * Context passed to workflow handlers.
 * Use `input`, `output`, and `loading` to interact with the user.
 */
export type RelayContext = {
  step: WorkflowStep;
  input: RelayInputFn;
  output: RelayWorkflow["output"];
  loading: RelayLoadingFn;
};

export type RelayHandler = (ctx: RelayContext) => Promise<void>;

export type RelayWorkflowRegistry = Record<string, RelayHandler>;

/**
 * Factory function for creating typed workflow handlers.
 * Provides full type inference for step, input, output, and loading.
 */
export function createWorkflow(handler: RelayHandler): RelayHandler {
  return handler;
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

    const { name } = event.payload;
    const handler = workflows[name];

    if (!handler) {
      await this.output(`Error: Unknown workflow: ${name}`);
      throw new Error(`Unknown workflow: ${name}`);
    }

    await handler({
      step,
      input: this.input,
      output: this.output,
      loading: this.loading,
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
   * Supports simple string prompts or structured input with a schema.
   */
  input: RelayInputFn = (async (prompt: string, schema?: InputSchema) => {
    if (!this.step) {
      throw new Error("Relay not initialized. Call initRelay() first.");
    }

    const eventName = this.stepName("input");

    await this.step.do(`${eventName}-request`, async () => {
      await this.sendMessage(createInputRequest(eventName, prompt, schema));
    });

    const event = await this.step.waitForEvent(eventName, {
      type: eventName,
      timeout: "5 minutes",
    });

    // Unwrap for simple case (no schema provided = normalized to { input: value })
    const payload = event.payload as Record<string, unknown>;
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
}

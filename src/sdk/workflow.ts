import {
  WorkflowEntrypoint,
  type WorkflowEvent,
  WorkflowStep,
} from "cloudflare:workers";
import { workflows } from "../registry";
import {
  createInputRequest,
  createLogMessage,
  type StreamMessage,
} from "./stream";

// Params passed to workflows
type WorkflowParams = {
  type: string;
  params?: any;
};

export class RelayWorkflow extends WorkflowEntrypoint<Env, WorkflowParams> {
  protected stream: DurableObjectStub | null = null;
  protected step: WorkflowStep | null = null;

  async run(event: WorkflowEvent<WorkflowParams>, step: WorkflowStep) {
    this.step = step;

    // Durable Objects are named using the workflow's instance ID
    this.stream = this.env.RELAY_DURABLE_OBJECT.getByName(event.instanceId);

    const { type, params } = event.payload;
    const handler = workflows[type];

    if (!handler) {
      await this.relay.output(`Error: Unknown workflow type: ${type}`);
      throw new Error(`Unknown workflow type: ${type}`);
    }

    await handler({ step, relay: this.relay, params });
  }

  private async sendMessage(message: StreamMessage): Promise<void> {
    if (!this.stream) {
      throw new Error("Relay not initialized. Call initRelay() first.");
    }

    await this.stream.fetch("http://internal/write", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
  }

  // Public "SDK" methods for interacting with the workflow
  relay = {
    output: async (text: string): Promise<void> => {
      await this.sendMessage(createLogMessage(text));
    },

    input: async (prompt: string): Promise<string> => {
      if (!this.step) {
        throw new Error("Relay not initialized. Call initRelay() first.");
      }

      // Generate unique event name
      const eventName = `input-${crypto.randomUUID()}`;

      // Send input request to stream
      await this.sendMessage(createInputRequest(eventName, prompt));

      // Wait for the user to respond
      const event = await this.step.waitForEvent(eventName, {
        type: eventName,
        timeout: "5 minutes",
      });

      // Return the payload as a string
      return event.payload as string;
    },
  };
}

import {
  WorkflowEntrypoint,
  DurableObject,
  WorkflowStep,
} from "cloudflare:workers";
import {
  StreamMessage,
  createLogMessage,
  createInputRequest,
} from "./stream-message";

/**
 * Extended WorkflowEntrypoint that provides Relay functionality
 */
export class RelayWorkflowEntrypoint<Env, Params> extends WorkflowEntrypoint<
  Env,
  Params
> {
  protected stream: DurableObjectStub | null = null;
  protected instanceId: string | null = null;
  protected workflowStep: WorkflowStep | null = null;

  protected initRelay<T extends DurableObject>(
    instanceId: string,
    namespace: DurableObjectNamespace<T>,
    step: WorkflowStep,
  ) {
    this.instanceId = instanceId;
    this.workflowStep = step;
    const id = namespace.idFromName(instanceId);
    this.stream = namespace.get(id);
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

  relay = {
    output: async (text: string): Promise<void> => {
      await this.sendMessage(createLogMessage(text));
    },

    input: async (prompt: string): Promise<string> => {
      if (!this.workflowStep) {
        throw new Error("Relay not initialized. Call initRelay() first.");
      }

      // Generate unique event name
      const eventName = `input-${crypto.randomUUID()}`;

      // Send input request to stream
      await this.sendMessage(createInputRequest(eventName, prompt));

      // Wait for the user to respond
      const event = await this.workflowStep.waitForEvent(eventName, {
        type: eventName,
        timeout: "5 minutes",
      });

      // Return the payload as a string
      return event.payload as string;
    },
  };
}

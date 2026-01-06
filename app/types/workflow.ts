// Re-export stream message types from SDK
export type {
  StreamMessage as WorkflowMessage,
  InputSchema,
  LogMessage,
  InputRequestMessage,
  InputReceivedMessage,
  LoadingMessage,
} from "../../src/sdk/utils";

export {
  StreamMessageSchema as WorkflowMessageSchema,
  parseStreamMessage,
} from "../../src/sdk/utils";

export type WorkflowStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "complete"
  | "error";

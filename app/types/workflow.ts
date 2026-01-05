// Re-export stream message types from SDK
export type {
  StreamMessage as WorkflowMessage,
  InputSchema,
  LogMessage,
  InputRequestMessage,
  InputReceivedMessage,
  LoadingMessage,
} from "../../src/sdk/stream";

export {
  StreamMessageSchema as WorkflowMessageSchema,
  parseStreamMessage,
} from "../../src/sdk/stream";

export type WorkflowStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "complete"
  | "error";

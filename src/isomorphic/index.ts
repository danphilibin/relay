/**
 * Isomorphic SDK exports — safe for both browser and backend use.
 * Nothing in this folder imports cloudflare:workers or other backend-only modules.
 */

export {
  type StreamMessage,
  type LogMessage,
  type InputRequestMessage,
  type InputReceivedMessage,
  type LoadingMessage,
  type ConfirmRequestMessage,
  type ConfirmReceivedMessage,
  type WorkflowCompleteMessage,
  type CallResponseResult,
  type CallResponseStatus,
  type InteractionPoint,
  StreamMessageSchema,
  parseStreamMessage,
} from "./messages";

export type { InputSchema, NormalizedButton } from "./input";

export {
  WorkflowParamsSchema,
  type WorkflowParams,
  StartWorkflowParamsSchema,
  type StartWorkflowParams,
  type WorkflowMeta,
} from "./registry-types";

export type WorkflowStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "complete"
  | "error";

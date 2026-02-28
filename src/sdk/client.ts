/**
 * Client-safe SDK surface intended to mirror a future `relayjs` package.
 *
 * This module must remain runtime-agnostic: no `cloudflare:workers` imports.
 */
export {
  type StreamMessage,
  type OutputMessage,
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
  formatCallResponseForMcp,
  type WorkflowParams,
  type StartWorkflowParams,
  type WorkflowMeta,
  type WorkflowStatus,
  type InputSchema,
  type NormalizedButton,
  type OutputBlock,
  type OutputButtonDef,
} from "../isomorphic";

export type { InputFieldDefinition } from "../isomorphic/input";

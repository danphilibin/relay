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
} from "../isomorphic/messages";

export { formatCallResponseForMcp } from "../isomorphic/mcp-translation";
export { field } from "../isomorphic/input";

export {
  type WorkflowParams,
  type StartWorkflowParams,
  type WorkflowMeta,
} from "../isomorphic/registry-types";

export type WorkflowStatus =
  | "idle"
  | "connecting"
  | "streaming"
  | "complete"
  | "error";

export type {
  InputSchema,
  InputFieldDefinition,
  InputFieldBuilder,
  InputFieldBuilders,
  RelayFieldFactory,
  TableFieldDefinition,
  NormalizedButton,
  SelectOption,
} from "../isomorphic/input";

export type {
  LoaderTableData,
  NormalizedTableColumn,
  NormalizedTableRow,
  OutputBlock,
  OutputButtonDef,
  OutputMetadataBlock,
  OutputTableLoaderBlock,
  RowKeyValue,
  SerializedColumnDef,
} from "../isomorphic/output";

import { z } from "zod";
import {
  type InputSchema,
  type ButtonDef,
  InputSchemaSchema,
  normalizeButtons,
} from "./input";

/**
 * Stream message schemas
 */
export const LogMessageSchema = z.object({
  id: z.string(),
  type: z.literal("log"),
  text: z.string(),
});

const NormalizedButtonSchema = z.object({
  label: z.string(),
  intent: z.enum(["primary", "secondary", "danger"]),
});

export const InputRequestMessageSchema = z.object({
  id: z.string(),
  type: z.literal("input_request"),
  prompt: z.string(),
  schema: InputSchemaSchema,
  buttons: z.array(NormalizedButtonSchema),
});

export const InputReceivedMessageSchema = z.object({
  id: z.string(),
  type: z.literal("input_received"),
  value: z.record(z.string(), z.unknown()),
});

export const LoadingMessageSchema = z.object({
  id: z.string(),
  type: z.literal("loading"),
  text: z.string(),
  complete: z.boolean(),
});

export const ConfirmRequestMessageSchema = z.object({
  id: z.string(),
  type: z.literal("confirm_request"),
  message: z.string(),
});

export const ConfirmReceivedMessageSchema = z.object({
  id: z.string(),
  type: z.literal("confirm_received"),
  approved: z.boolean(),
});

export const WorkflowCompleteMessageSchema = z.object({
  id: z.string(),
  type: z.literal("workflow_complete"),
});

export const StreamMessageSchema = z.discriminatedUnion("type", [
  LogMessageSchema,
  InputRequestMessageSchema,
  InputReceivedMessageSchema,
  LoadingMessageSchema,
  ConfirmRequestMessageSchema,
  ConfirmReceivedMessageSchema,
  WorkflowCompleteMessageSchema,
]);

export type LogMessage = z.infer<typeof LogMessageSchema>;
export type InputRequestMessage = z.infer<typeof InputRequestMessageSchema>;
export type InputReceivedMessage = z.infer<typeof InputReceivedMessageSchema>;
export type LoadingMessage = z.infer<typeof LoadingMessageSchema>;
export type ConfirmRequestMessage = z.infer<typeof ConfirmRequestMessageSchema>;
export type ConfirmReceivedMessage = z.infer<
  typeof ConfirmReceivedMessageSchema
>;
export type WorkflowCompleteMessage = z.infer<
  typeof WorkflowCompleteMessageSchema
>;
export type StreamMessage = z.infer<typeof StreamMessageSchema>;

/**
 * Factory functions for creating messages
 */
export function createLogMessage(id: string, text: string): LogMessage {
  return { id, type: "log", text };
}

export function createInputRequest(
  id: string,
  prompt: string,
  schema?: InputSchema,
  buttons?: ButtonDef[],
): InputRequestMessage {
  // Normalize simple prompts to a single text field schema
  const normalizedSchema: InputSchema = schema ?? {
    input: { type: "text", label: prompt },
  };
  return {
    type: "input_request",
    id,
    prompt,
    schema: normalizedSchema,
    buttons: normalizeButtons(buttons),
  };
}

export function createInputReceived(
  id: string,
  value: Record<string, unknown>,
): InputReceivedMessage {
  return { id, type: "input_received", value };
}

export function createLoadingMessage(
  id: string,
  text: string,
  complete: boolean,
): LoadingMessage {
  return { id, type: "loading", text, complete };
}

export function createConfirmRequest(
  id: string,
  message: string,
): ConfirmRequestMessage {
  return { id, type: "confirm_request", message };
}

export function createConfirmReceived(
  id: string,
  approved: boolean,
): ConfirmReceivedMessage {
  return { id, type: "confirm_received", approved };
}

export function createWorkflowComplete(id: string): WorkflowCompleteMessage {
  return { id, type: "workflow_complete" };
}

/**
 * Parse a stream message from JSON, throwing on invalid input
 */
export function parseStreamMessage(data: unknown): StreamMessage {
  return StreamMessageSchema.parse(data);
}

/**
 * Derive the call-response status from an interaction point message.
 */
export type CallResponseStatus =
  | "awaiting_input"
  | "awaiting_confirm"
  | "complete";

export function interactionStatus(
  interaction: InteractionPoint,
): CallResponseStatus {
  if (!interaction) return "complete";
  if (interaction.type === "input_request") return "awaiting_input";
  return "awaiting_confirm";
}

/**
 * The interaction point in a call-response result — either an input/confirm
 * request the agent needs to respond to, or null if the workflow is complete.
 */
export type InteractionPoint =
  | InputRequestMessage
  | ConfirmRequestMessage
  | null;

/**
 * Response shape for the call-response API.
 */
export type CallResponseResult = {
  run_id: string;
  status: CallResponseStatus;
  messages: StreamMessage[];
  interaction: InteractionPoint;
};

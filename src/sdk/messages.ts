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

export const StreamMessageSchema = z.discriminatedUnion("type", [
  LogMessageSchema,
  InputRequestMessageSchema,
  InputReceivedMessageSchema,
  LoadingMessageSchema,
]);

export type LogMessage = z.infer<typeof LogMessageSchema>;
export type InputRequestMessage = z.infer<typeof InputRequestMessageSchema>;
export type InputReceivedMessage = z.infer<typeof InputReceivedMessageSchema>;
export type LoadingMessage = z.infer<typeof LoadingMessageSchema>;
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

/**
 * Parse a stream message from JSON, throwing on invalid input
 */
export function parseStreamMessage(data: unknown): StreamMessage {
  return StreamMessageSchema.parse(data);
}

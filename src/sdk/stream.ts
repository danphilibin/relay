import { z } from "zod";

/**
 * Input field definition schemas for structured input
 */
const TextFieldSchema = z.object({
  type: z.literal("text"),
  label: z.string(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
});

const CheckboxFieldSchema = z.object({
  type: z.literal("checkbox"),
  label: z.string(),
  required: z.boolean().optional(),
});

const NumberFieldSchema = z.object({
  type: z.literal("number"),
  label: z.string(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
});

const SelectFieldSchema = z.object({
  type: z.literal("select"),
  label: z.string(),
  options: z.array(z.object({ value: z.string(), label: z.string() })),
  required: z.boolean().optional(),
});

export const InputFieldDefinitionSchema = z.discriminatedUnion("type", [
  TextFieldSchema,
  CheckboxFieldSchema,
  NumberFieldSchema,
  SelectFieldSchema,
]);

export type InputFieldDefinition = z.infer<typeof InputFieldDefinitionSchema>;

/**
 * Schema for structured input - a record of field names to field definitions
 */
export const InputSchemaSchema = z.record(
  z.string(),
  InputFieldDefinitionSchema,
);
export type InputSchema = z.infer<typeof InputSchemaSchema>;

/**
 * Maps a single field definition to its result type
 */
type InferFieldType<T extends InputFieldDefinition> = T["type"] extends "text"
  ? string
  : T["type"] extends "checkbox"
    ? boolean
    : T["type"] extends "number"
      ? number
      : T["type"] extends "select"
        ? string
        : never;

/**
 * Infers the result type from an input schema
 */
export type InferInputResult<T extends InputSchema> = {
  [K in keyof T]: InferFieldType<T[K]>;
};

/**
 * Stream message schemas
 */
export const LogMessageSchema = z.object({
  type: z.literal("log"),
  text: z.string(),
});

export const InputRequestMessageSchema = z.object({
  type: z.literal("input_request"),
  eventName: z.string(),
  prompt: z.string(),
  schema: InputSchemaSchema.optional(),
});

export const InputReceivedMessageSchema = z.object({
  type: z.literal("input_received"),
  value: z.union([z.string(), z.record(z.string(), z.unknown())]),
});

export const LoadingMessageSchema = z.object({
  type: z.literal("loading"),
  id: z.string(),
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
export function createLogMessage(text: string): LogMessage {
  return { type: "log", text };
}

export function createInputRequest(
  eventName: string,
  prompt: string,
  schema?: InputSchema,
): InputRequestMessage {
  if (schema) {
    return { type: "input_request", eventName, prompt, schema };
  }
  return { type: "input_request", eventName, prompt };
}

export function createInputReceived(
  value: string | Record<string, unknown>,
): InputReceivedMessage {
  return { type: "input_received", value };
}

export function createLoadingMessage(
  id: string,
  text: string,
  complete: boolean,
): LoadingMessage {
  return { type: "loading", id, text, complete };
}

/**
 * Parse a stream message from JSON, throwing on invalid input
 */
export function parseStreamMessage(data: unknown): StreamMessage {
  return StreamMessageSchema.parse(data);
}

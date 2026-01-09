import { z } from "zod";
import type { RelayHandler } from "./workflow";

export type WorkflowDefinition = {
  slug: string;
  title: string;
  handler: RelayHandler;
};

const workflows: Map<string, WorkflowDefinition> = new Map();

export type WorkflowMeta = Pick<WorkflowDefinition, "slug" | "title">;

/**
 * Converts a title to a URL-friendly slug
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function registerWorkflow(title: string, handler: RelayHandler): void {
  const slug = slugify(title);
  workflows.set(slug, { slug, title, handler });
}

export function getWorkflow(slug: string): RelayHandler | undefined {
  return workflows.get(slug)?.handler;
}

export function getWorkflowList(): { slug: string; title: string }[] {
  return Array.from(workflows.values())
    .map(({ slug, title }) => ({
      slug,
      title,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export const WorkflowParamsSchema = z.object({
  name: z.string(),
});

export type WorkflowParams = z.infer<typeof WorkflowParamsSchema>;

export const StartWorkflowParamsSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type StartWorkflowParams = z.infer<typeof StartWorkflowParamsSchema>;

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
 * Button definitions for input options
 */
export type ButtonDef =
  | string
  | { label: string; intent?: "primary" | "secondary" | "danger" };

export type NormalizedButton = {
  label: string;
  intent: "primary" | "secondary" | "danger";
};

export type InputOptions<
  B extends readonly ButtonDef[] = readonly ButtonDef[],
> = {
  buttons: B;
};

type ButtonLabel<B extends ButtonDef> = B extends string
  ? B
  : B extends { label: infer L }
    ? L
    : never;

export type ButtonLabels<B extends readonly ButtonDef[]> = ButtonLabel<
  B[number]
>;

function normalizeButtons(buttons?: ButtonDef[]): NormalizedButton[] {
  if (!buttons?.length) {
    return [{ label: "Continue", intent: "primary" }];
  }
  return buttons.map((btn) =>
    typeof btn === "string"
      ? { label: btn, intent: "primary" }
      : { label: btn.label, intent: btn.intent ?? "primary" },
  );
}

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

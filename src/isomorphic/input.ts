import { z } from "zod";

/**
 * Input field definition schemas for structured input
 */
const TextFieldSchema = z.object({
  type: z.literal("text"),
  label: z.string(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
});

const CheckboxFieldSchema = z.object({
  type: z.literal("checkbox"),
  label: z.string(),
  description: z.string().optional(),
  required: z.boolean().optional(),
});

const NumberFieldSchema = z.object({
  type: z.literal("number"),
  label: z.string(),
  description: z.string().optional(),
  placeholder: z.string().optional(),
  required: z.boolean().optional(),
});

const SelectFieldSchema = z.object({
  type: z.literal("select"),
  label: z.string(),
  description: z.string().optional(),
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

export function normalizeButtons(buttons?: ButtonDef[]): NormalizedButton[] {
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
 * Input function type with overloads for simple and structured inputs
 */
export type RelayInputFn = {
  // Simple prompt
  (prompt: string): Promise<string>;

  // Prompt with schema
  <T extends InputSchema>(
    prompt: string,
    schema: T,
  ): Promise<InferInputResult<T>>;

  // Prompt with buttons
  <const B extends readonly ButtonDef[]>(
    prompt: string,
    options: InputOptions<B>,
  ): Promise<{ value: string; $choice: ButtonLabels<B> }>;

  // Schema with buttons
  <T extends InputSchema, const B extends readonly ButtonDef[]>(
    prompt: string,
    schema: T,
    options: InputOptions<B>,
  ): Promise<InferInputResult<T> & { $choice: ButtonLabels<B> }>;
};

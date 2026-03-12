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

export type TextFieldConfig = Omit<
  z.infer<typeof TextFieldSchema>,
  "type" | "label"
>;
export type CheckboxFieldConfig = Omit<
  z.infer<typeof CheckboxFieldSchema>,
  "type" | "label"
>;
export type NumberFieldConfig = Omit<
  z.infer<typeof NumberFieldSchema>,
  "type" | "label"
>;
export type SelectOption<V extends string = string> = {
  value: V;
  label: string;
};
export type SelectFieldConfig<V extends string = string> = Omit<
  z.infer<typeof SelectFieldSchema>,
  "type" | "label" | "options"
> & {
  options: readonly SelectOption<V>[];
};

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

type FieldTypeMap = {
  text: string;
  number: number;
  checkbox: boolean;
  select: string;
};

/**
 * Maps a single field definition to its result type
 */
type InferFieldType<T extends InputFieldDefinition> = FieldTypeMap[T["type"]];

type InputFieldBuilderBrand = {
  readonly __relayFieldBuilder: true;
};

export type InputFieldBuilder<
  TValue,
  TDef extends InputFieldDefinition = InputFieldDefinition,
> = InputFieldBuilderBrand &
  PromiseLike<TValue> & {
    readonly definition: TDef;
  };

export type InputFieldBuilders = Record<string, InputFieldBuilder<unknown>>;

export type InferBuilderValue<T extends InputFieldBuilder<unknown>> =
  T extends InputFieldBuilder<infer TValue> ? TValue : never;

export type InferBuilderGroupResult<TFields extends InputFieldBuilders> = {
  [K in keyof TFields]: InferBuilderValue<TFields[K]>;
};

/**
 * Infers the result type from an input schema
 */
export type InferInputResult<T extends InputSchema> = {
  [K in keyof T]: InferFieldType<T[K]>;
};

export type InputDefinition = InputSchema | InputFieldBuilders;

export type InferInputDefinitionResult<T extends InputDefinition> =
  T extends InputSchema
    ? InferInputResult<T>
    : T extends InputFieldBuilders
      ? InferBuilderGroupResult<T>
      : never;

export function isInputFieldBuilder(
  value: unknown,
): value is InputFieldBuilder<unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    "__relayFieldBuilder" in value &&
    "definition" in value
  );
}

export function compileInputFields<TFields extends InputFieldBuilders>(
  fields: TFields,
): InputSchema {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.definition]),
  );
}

export function compileInputDefinition(
  input: InputDefinition | undefined,
): InputSchema | undefined {
  if (!input) return undefined;
  return isInputFieldBuilder(Object.values(input)[0])
    ? compileInputFields(input as InputFieldBuilders)
    : (input as InputSchema);
}

type InputGroupFn = {
  <TFields extends InputFieldBuilders>(
    fields: TFields,
  ): Promise<InferBuilderGroupResult<TFields>>;
  <TFields extends InputFieldBuilders, const B extends readonly ButtonDef[]>(
    fields: TFields,
    options: InputOptions<B>,
  ): Promise<InferBuilderGroupResult<TFields> & { $choice: ButtonLabels<B> }>;
  <TFields extends InputFieldBuilders>(
    fields: TFields,
    prompt: string,
  ): Promise<InferBuilderGroupResult<TFields>>;
  <TFields extends InputFieldBuilders, const B extends readonly ButtonDef[]>(
    fields: TFields,
    prompt: string,
    options: InputOptions<B>,
  ): Promise<InferBuilderGroupResult<TFields> & { $choice: ButtonLabels<B> }>;
};

type InputTextFn = (
  label: string,
  config?: TextFieldConfig,
) => InputFieldBuilder<string, Extract<InputFieldDefinition, { type: "text" }>>;

type InputCheckboxFn = (
  label: string,
  config?: CheckboxFieldConfig,
) => InputFieldBuilder<
  boolean,
  Extract<InputFieldDefinition, { type: "checkbox" }>
>;

type InputNumberFn = (
  label: string,
  config?: NumberFieldConfig,
) => InputFieldBuilder<
  number,
  Extract<InputFieldDefinition, { type: "number" }>
>;

type InputSelectFn = <const TOptions extends readonly SelectOption[]>(
  label: string,
  config: Omit<SelectFieldConfig<TOptions[number]["value"]>, "options"> & {
    options: TOptions;
  },
) => InputFieldBuilder<
  TOptions[number]["value"],
  Extract<InputFieldDefinition, { type: "select" }>
>;

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
} & {
  text: InputTextFn;
  checkbox: InputCheckboxFn;
  number: InputNumberFn;
  select: InputSelectFn;
  group: InputGroupFn;
};

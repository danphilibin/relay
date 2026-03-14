import { z } from "zod";
import type { RowKeyValue } from "./table";

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

const TableFieldSchema = z.object({
  type: z.literal("table"),
  label: z.string(),
  description: z.string().optional(),
  loader: z.object({
    path: z.string(),
    pageSize: z.number().optional(),
  }),
  /** Field name used to identify rows for selection (defaults to "id") */
  rowKey: z.string(),
  /** Whether the user can select one row or many */
  selection: z.enum(["single", "multiple"]),
});

export const InputFieldDefinitionSchema = z.discriminatedUnion("type", [
  TextFieldSchema,
  CheckboxFieldSchema,
  NumberFieldSchema,
  SelectFieldSchema,
  TableFieldSchema,
]);

export type InputFieldDefinition = z.infer<typeof InputFieldDefinitionSchema>;
export type TableFieldDefinition = z.infer<typeof TableFieldSchema>;

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
  table: RowKeyValue[];
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

function createStaticFieldBuilder<TValue, TDef extends InputFieldDefinition>(
  definition: TDef,
): InputFieldBuilder<TValue, TDef> {
  return {
    __relayFieldBuilder: true,
    definition,
    // oxlint-disable-next-line unicorn/no-thenable -- static field builders share the same builder contract as awaitable runtime builders
    then: () => {
      throw new Error(
        "Field builders from `field.*` are only for schema composition. Await `input.*` inside a workflow handler instead.",
      );
    },
  };
}

export function compileInputFields<TFields extends InputFieldBuilders>(
  fields: TFields,
): InputSchema {
  return Object.fromEntries(
    Object.entries(fields).map(([key, field]) => [key, field.definition]),
  );
}

type InputGroupFn = {
  <TFields extends InputFieldBuilders>(
    fields: TFields,
  ): Promise<InferBuilderGroupResult<TFields>>;
  <TFields extends InputFieldBuilders>(
    title: string,
    fields: TFields,
  ): Promise<InferBuilderGroupResult<TFields>>;
  <TFields extends InputFieldBuilders, const B extends readonly ButtonDef[]>(
    fields: TFields,
    options: InputOptions<B>,
  ): Promise<InferBuilderGroupResult<TFields> & { $choice: ButtonLabels<B> }>;
  <TFields extends InputFieldBuilders, const B extends readonly ButtonDef[]>(
    title: string,
    fields: TFields,
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

export type RelayFieldFactory = {
  text: InputTextFn;
  checkbox: InputCheckboxFn;
  number: InputNumberFn;
  select: InputSelectFn;
};

export const field: RelayFieldFactory = {
  text: (label, config = {}) =>
    createStaticFieldBuilder({ type: "text", label, ...config }),
  checkbox: (label, config = {}) =>
    createStaticFieldBuilder({ type: "checkbox", label, ...config }),
  number: (label, config = {}) =>
    createStaticFieldBuilder({ type: "number", label, ...config }),
  select: (label, config) =>
    createStaticFieldBuilder({
      type: "select",
      label,
      ...config,
      options: [...config.options],
    }),
};

/**
 * Input function type with overloads for simple and structured inputs
 */
export type RelayInputFn = {
  // Simple prompt
  (prompt: string): Promise<string>;

  // Prompt with buttons
  <const B extends readonly ButtonDef[]>(
    prompt: string,
    options: InputOptions<B>,
  ): Promise<{ value: string; $choice: ButtonLabels<B> }>;
} & {
  text: InputTextFn;
  checkbox: InputCheckboxFn;
  number: InputNumberFn;
  select: InputSelectFn;
  group: InputGroupFn;
};

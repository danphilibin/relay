import {
  type InputFieldBuilders,
  type InputOptions,
  type ButtonDef,
  type ButtonLabels,
  type InputTextFn,
  type InputCheckboxFn,
  type InputNumberFn,
  type InputSelectFn,
  type InputGroupFn,
  compileInputFields,
  type InferBuilderGroupResult,
} from "../isomorphic/input";
import type { OutputButtonDef } from "../isomorphic/output";
import type { ExecutorStep } from "./context-builders";
import { registerWorkflow } from "./registry";
import type {
  LoaderDef,
  LoaderRefs,
  TableInputSingle,
  TableInputMultiple,
  TableInputStaticSingle,
  TableInputStaticMultiple,
  TableOutputStatic,
  TableOutputLoader,
} from "./loader";

/**
 * Context passed to the loading callback
 */
export type LoadingContext = {
  complete: (message: string) => void;
};

/**
 * Loading function type
 */
export type RelayLoadingFn = (
  message: string,
  callback: (ctx: LoadingContext) => Promise<void>,
) => Promise<void>;

/**
 * Confirm function type - prompts user for approval
 */
export type RelayConfirmFn = (message: string) => Promise<boolean>;

/**
 * Table selection helper — supports both loader-backed and static tables.
 * Static overloads are listed first so TypeScript prefers them when `data`
 * is present (both shapes would otherwise match due to structural typing).
 */
export type RelayInputTableFn = {
  <TRow>(opts: TableInputStaticSingle<TRow>): Promise<TRow>;
  <TRow>(opts: TableInputStaticMultiple<TRow>): Promise<TRow[]>;
  <TRow>(opts: TableInputSingle<TRow>): Promise<TRow>;
  <TRow>(opts: TableInputMultiple<TRow>): Promise<TRow[]>;
};

export type RelayOutput = {
  markdown: (content: string) => Promise<void>;
  table: <TRow>(
    opts: TableOutputStatic | TableOutputLoader<TRow>,
  ) => Promise<void>;
  code: (content: { code: string; language?: string }) => Promise<void>;
  image: (opts: { src: string; alt?: string }) => Promise<void>;
  link: (opts: {
    url: string;
    title?: string;
    description?: string;
  }) => Promise<void>;
  buttons: (buttons: OutputButtonDef[]) => Promise<void>;
  metadata: (opts: {
    title?: string;
    data: Record<string, string | number | boolean | null>;
  }) => Promise<void>;
};

/**
 * Input function type for workflow handlers.
 * Callable directly for simple text prompts, with methods for typed fields
 * and table selection.
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
  table: RelayInputTableFn;
};

/**
 * Context passed to workflow handlers.
 * Use `input`, `output`, `loading`, and `confirm` to interact with the user.
 */
export type RelayContext = {
  step: ExecutorStep;
  input: RelayInputFn;
  output: RelayOutput;
  loading: RelayLoadingFn;
  confirm: RelayConfirmFn;
};

export type RelayHandler = (ctx: RelayContext) => Promise<void>;

/**
 * Factory function for creating and registering workflow handlers.
 * Supports loaders for server-side data fetching.
 */
export function createWorkflow<
  T extends InputFieldBuilders,
  L extends Record<string, LoaderDef<any, any>> = Record<string, never>,
>(config: {
  name: string;
  description?: string;
  /** Expose this workflow as an MCP tool (default: false). */
  mcp?: boolean;
  input: T;
  loaders?: L;
  handler: (
    ctx: RelayContext & {
      data: InferBuilderGroupResult<T>;
      loaders: LoaderRefs<L>;
    },
  ) => Promise<void>;
}): void;
export function createWorkflow<
  L extends Record<string, LoaderDef<any, any>> = Record<string, never>,
>(config: {
  name: string;
  description?: string;
  /** Expose this workflow as an MCP tool (default: false). */
  mcp?: boolean;
  loaders?: L;
  handler: (ctx: RelayContext & { loaders: LoaderRefs<L> }) => Promise<void>;
}): void;
export function createWorkflow(config: {
  name: string;
  description?: string;
  mcp?: boolean;
  input?: InputFieldBuilders;
  loaders?: Record<string, LoaderDef>;
  handler: (...args: any[]) => Promise<void>;
}): void {
  // Extract loader definitions for the registry
  const loaders = config.loaders
    ? Object.fromEntries(
        Object.entries(config.loaders).map(([name, def]) => [
          name,
          {
            fn: def.fn,
            paramDescriptor: def.paramDescriptor,
            rowKey: def.rowKey,
            resolve: def.resolve,
          },
        ]),
      )
    : undefined;

  registerWorkflow({
    title: config.name,
    handler: config.handler as RelayHandler,
    input: config.input ? compileInputFields(config.input) : undefined,
    description: config.description,
    loaders,
    mcp: config.mcp,
  });
}

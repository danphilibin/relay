import {
  type RelayInputFn,
  type InputFieldBuilders,
  compileInputFields,
  type InferBuilderGroupResult,
} from "../isomorphic/input";
import type { OutputButtonDef } from "../isomorphic/output";
import type { ExecutorStep } from "./cf-executor";
import { registerWorkflow } from "./registry";
import {
  type LoaderDef,
  type LoaderRefs,
  type TableInputSingle,
  type TableInputMultiple,
  type TableInputStaticSingle,
  type TableInputStaticMultiple,
  type TableOutputStatic,
  type TableOutputLoader,
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
 * Context passed to workflow handlers.
 * Use `input`, `output`, `loading`, and `confirm` to interact with the user.
 */
export type RelayContext = {
  step: ExecutorStep;
  input: RelayInputFn & { table: RelayInputTableFn };
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
  loaders?: L;
  handler: (ctx: RelayContext & { loaders: LoaderRefs<L> }) => Promise<void>;
}): void;
export function createWorkflow(config: {
  name: string;
  description?: string;
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

  registerWorkflow(
    config.name,
    config.handler as RelayHandler,
    config.input ? compileInputFields(config.input) : undefined,
    config.description,
    loaders,
  );
}

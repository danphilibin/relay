import {
  type RelayInputFn,
  type InputFieldBuilders,
  compileInputFields,
  type InferBuilderGroupResult,
} from "../isomorphic/input";
import type { OutputButtonDef } from "../isomorphic/output";
import type { ExecutorStep } from "./cf-executor";
import { registerWorkflow } from "./registry";

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

export type RelayOutput = {
  markdown: (content: string) => Promise<void>;
  table: (table: {
    title?: string;
    data: Array<Record<string, string>>;
  }) => Promise<void>;
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
  input: RelayInputFn;
  output: RelayOutput;
  loading: RelayLoadingFn;
  confirm: RelayConfirmFn;
};

export type RelayHandler = (ctx: RelayContext) => Promise<void>;

/**
 * Factory function for creating and registering workflow handlers.
 * When `input` is provided, the handler receives typed `data` with the collected values.
 */
export function createWorkflow<T extends InputFieldBuilders>(config: {
  name: string;
  description?: string;
  input: T;
  handler: (
    ctx: RelayContext & { data: InferBuilderGroupResult<T> },
  ) => Promise<void>;
}): void;
export function createWorkflow(config: {
  name: string;
  description?: string;
  handler: RelayHandler;
}): void;
export function createWorkflow(config: {
  name: string;
  description?: string;
  input?: InputFieldBuilders;
  handler: (...args: any[]) => Promise<void>;
}): void {
  registerWorkflow(
    config.name,
    config.handler as RelayHandler,
    config.input ? compileInputFields(config.input) : undefined,
    config.description,
  );
}

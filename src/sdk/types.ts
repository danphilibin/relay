import { WorkflowStep } from "cloudflare:workers";

export type WorkflowContext = {
  step: WorkflowStep;
  relay: {
    input: (prompt: string) => Promise<string>;
    output: (msg: string) => Promise<void>;
  };
  params: any;
};

export type WorkflowHandler = (ctx: WorkflowContext) => Promise<void>;

export function createWorkflow(fn: WorkflowHandler): WorkflowHandler {
  return fn;
}

export type WorkflowRegistry = Record<string, WorkflowHandler>;

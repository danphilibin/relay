import { WorkflowEntrypoint } from "cloudflare:workers";

/**
 * Example extension of WorkflowEntrypoint that adds our custom methods.
 */
export class RelayWorkflowEntrypoint<Env, Params> extends WorkflowEntrypoint<
  Env,
  Params
> {
  getString() {
    return "foo";
  }
}

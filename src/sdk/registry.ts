import type { RelayHandler } from "./cf-workflow";
import type { InputSchema } from "./input";
import {
  type WorkflowMeta,
  type WorkflowParams,
  type StartWorkflowParams,
  WorkflowParamsSchema,
  StartWorkflowParamsSchema,
} from "./registry-types";

export type { WorkflowMeta, WorkflowParams, StartWorkflowParams };
export { WorkflowParamsSchema, StartWorkflowParamsSchema };

export type WorkflowDefinition = {
  slug: string;
  title: string;
  description?: string;
  handler: RelayHandler;
  input?: InputSchema;
};

const workflows: Map<string, WorkflowDefinition> = new Map();

/**
 * Converts a title to a URL-friendly slug
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function registerWorkflow(
  title: string,
  handler: RelayHandler,
  input?: InputSchema,
  description?: string,
): void {
  const slug = slugify(title);
  workflows.set(slug, { slug, title, description, handler, input });
}

export function getWorkflow(slug: string): WorkflowDefinition | undefined {
  return workflows.get(slug);
}

export function getWorkflowList(): { slug: string; title: string; description?: string }[] {
  return Array.from(workflows.values())
    .map(({ slug, title, description }) => ({
      slug,
      title,
      description,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}


import type { RelayHandler } from "./cf-workflow";
import type { InputSchema } from "@/isomorphic/input";
import {
  type WorkflowMeta,
  type WorkflowParams,
  WorkflowParamsSchema,
} from "@/isomorphic/registry-types";

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

export function getWorkflowList(): {
  slug: string;
  title: string;
  description?: string;
  input?: InputSchema;
}[] {
  return Array.from(workflows.values())
    .map(({ slug, title, description, input }) => ({
      slug,
      title,
      description,
      input,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

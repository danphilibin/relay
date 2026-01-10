import { z } from "zod";
import type { RelayHandler } from "./cf-workflow";

export type WorkflowDefinition = {
  slug: string;
  title: string;
  handler: RelayHandler;
};

const workflows: Map<string, WorkflowDefinition> = new Map();

export type WorkflowMeta = Pick<WorkflowDefinition, "slug" | "title">;

/**
 * Converts a title to a URL-friendly slug
 */
export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function registerWorkflow(title: string, handler: RelayHandler): void {
  const slug = slugify(title);
  workflows.set(slug, { slug, title, handler });
}

export function getWorkflow(slug: string): RelayHandler | undefined {
  return workflows.get(slug)?.handler;
}

export function getWorkflowList(): { slug: string; title: string }[] {
  return Array.from(workflows.values())
    .map(({ slug, title }) => ({
      slug,
      title,
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}

export const WorkflowParamsSchema = z.object({
  name: z.string(),
});

export type WorkflowParams = z.infer<typeof WorkflowParamsSchema>;

export const StartWorkflowParamsSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type StartWorkflowParams = z.infer<typeof StartWorkflowParamsSchema>;

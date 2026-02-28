/**
 * Registry types and schemas - safe for client use.
 * Separated from registry.ts to avoid cloudflare:workers dependency.
 */
import { z } from "zod";

export type WorkflowMeta = {
  slug: string;
  title: string;
  description?: string;
};

export const WorkflowParamsSchema = z.object({
  name: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export type WorkflowParams = z.infer<typeof WorkflowParamsSchema>;

export const StartWorkflowParamsSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export type StartWorkflowParams = z.infer<typeof StartWorkflowParamsSchema>;

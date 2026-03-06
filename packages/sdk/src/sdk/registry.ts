import type { RelayHandler } from "./cf-workflow";
import type { InputSchema } from "../isomorphic/input";
import type { LoaderDef, CellValue } from "./loader";

export type WorkflowDefinition = {
  slug: string;
  title: string;
  description?: string;
  handler: RelayHandler;
  input?: InputSchema;
  loaders?: Record<
    string,
    {
      fn: LoaderDef["fn"];
      paramDescriptor?: LoaderDef["paramDescriptor"];
    }
  >;
  /** renderCell functions keyed by step ID + column index */
  renderCells: Map<string, Array<((row: any) => CellValue) | null>>;
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
  loaders?: Record<
    string,
    {
      fn: LoaderDef["fn"];
      paramDescriptor?: LoaderDef["paramDescriptor"];
    }
  >,
): void {
  const slug = slugify(title);
  workflows.set(slug, {
    slug,
    title,
    description,
    handler,
    input,
    loaders,
    renderCells: new Map(),
  });
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

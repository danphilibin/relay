import type { RelayHandler } from "./cf-workflow";
import type { InputSchema } from "../isomorphic/input";
import type { LoaderDef, TableRendererDef } from "./loader";

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
};

const workflows: Map<string, WorkflowDefinition> = new Map();
// Process-local table renderer registry. A named table renderer keeps its
// callbacks on the server while loader responses only stream serialized column
// metadata to the UI.
const tableRenderers: Map<string, TableRendererDef<any>> = new Map();

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
  });
}

export function getWorkflow(slug: string): WorkflowDefinition | undefined {
  return workflows.get(slug);
}

export function registerTableRenderer(
  tableRenderer: TableRendererDef<any>,
): void {
  if (tableRenderers.has(tableRenderer.name)) {
    throw new Error(
      `Duplicate table renderer registration: ${tableRenderer.name}`,
    );
  }
  tableRenderers.set(tableRenderer.name, tableRenderer);
}

export function getTableRenderer(
  name: string,
): TableRendererDef<any> | undefined {
  return tableRenderers.get(name);
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

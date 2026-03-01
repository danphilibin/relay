/**
 * MCP server factory that exposes Relay workflows as tools.
 *
 * Each workflow becomes a callable tool. Workflows with upfront input schemas
 * have those fields as tool parameters. Workflows without upfront input take
 * no parameters — the first interaction is returned in the tool result.
 *
 * A generic `relay_respond` tool handles mid-run interactions (input requests
 * and confirmations that happen during workflow execution).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import type {
  InputFieldDefinition,
  InputSchema,
} from "../isomorphic/input";
import type { CallResponseResult } from "../isomorphic/messages";
import { formatCallResponseForMcp } from "../isomorphic/mcp-translation";

type WorkflowInfo = {
  slug: string;
  title: string;
  description?: string;
  input?: InputSchema;
};

export type CreateRelayMcpServerOptions = {
  /** Base URL for the Relay API (e.g. "http://localhost:8787") */
  apiUrl: string;
  /** MCP server name (default: "relay") */
  name?: string;
  /** MCP server version (default: "0.1.0") */
  version?: string;
};

function assertNever(value: never): never {
  throw new Error(`Unhandled input field type: ${JSON.stringify(value)}`);
}

// ── Relay API client ─────────────────────────────────────────────

function createApiClient(apiUrl: string) {
  async function fetchWorkflows(): Promise<WorkflowInfo[]> {
    const res = await fetch(`${apiUrl}/workflows`);
    const data = (await res.json()) as { workflows: WorkflowInfo[] };
    return data.workflows;
  }

  async function startWorkflow(
    slug: string,
    data?: Record<string, unknown>,
  ): Promise<CallResponseResult> {
    const res = await fetch(`${apiUrl}/api/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflow: slug, data }),
    });
    return res.json() as Promise<CallResponseResult>;
  }

  async function respondToWorkflow(
    runId: string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<CallResponseResult> {
    const res = await fetch(`${apiUrl}/api/run/${runId}/respond`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, data }),
    });
    return res.json() as Promise<CallResponseResult>;
  }

  return { fetchWorkflows, startWorkflow, respondToWorkflow };
}

// ── InputSchema → Zod schema conversion ──────────────────────────

export function inputSchemaToZod(
  input: WorkflowInfo["input"],
): Record<string, z.ZodType> {
  if (!input) return {};

  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(input) as [
    string,
    InputFieldDefinition,
  ][]) {
    const desc = field.description || field.label;
    switch (field.type) {
      case "text":
        shape[key] = z.string().describe(desc);
        break;
      case "number":
        shape[key] = z.number().describe(desc);
        break;
      case "checkbox":
        shape[key] = z.boolean().describe(desc);
        break;
      case "select":
        shape[key] = z
          .enum(
            field.options.map((option) => option.value) as [
              string,
              ...string[],
            ],
          )
          .describe(desc);
        break;
      default:
        assertNever(field);
    }
  }
  return shape;
}

// ── MCP server factory ───────────────────────────────────────────

export function createRelayMcpServer(options: CreateRelayMcpServerOptions) {
  const {
    apiUrl,
    name = "relay",
    version = "0.1.0",
  } = options;

  const api = createApiClient(apiUrl);

  const server = new McpServer({ name, version });

  // Register the generic respond tool
  server.tool(
    "relay_respond",
    "Respond to a running workflow that is awaiting input or confirmation. " +
      "Use this after a workflow tool returns a paused state.",
    {
      run_id: z
        .string()
        .describe("The run_id from the previous workflow response"),
      event: z
        .string()
        .describe("The event name from the interaction (e.g. relay-input-1)"),
      data: z
        .record(z.string(), z.unknown())
        .describe(
          'Response data. For input: the field values (e.g. {"input": "hello"}). ' +
            'For confirm: {"approved": true} or {"approved": false}.',
        ),
    },
    async ({ run_id, event, data }) => {
      const result = await api.respondToWorkflow(run_id, event, data);
      return {
        content: [{ type: "text", text: formatCallResponseForMcp(result) }],
      };
    },
  );

  async function registerWorkflowTools() {
    const workflows = await api.fetchWorkflows();

    for (const workflow of workflows) {
      const toolName = workflow.slug.replace(/-/g, "_");
      const description =
        workflow.description || `Run the "${workflow.title}" workflow`;

      const zodSchema = inputSchemaToZod(workflow.input);
      server.tool(
        toolName,
        description,
        zodSchema,
        async (params: Record<string, unknown>) => {
          const data = Object.keys(zodSchema).length > 0 ? params : undefined;
          const result = await api.startWorkflow(workflow.slug, data);
          return {
            content: [
              { type: "text", text: formatCallResponseForMcp(result) },
            ],
          };
        },
      );
    }
  }

  return {
    async start() {
      await registerWorkflowTools();
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
  };
}

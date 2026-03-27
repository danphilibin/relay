/**
 * Registers Relay workflow tools on an MCP server.
 *
 * Relay can be consumed as an MCP server in two ways: over stdio (for
 * local clients like Claude Desktop) and as a Cloudflare Workers Durable
 * Object (co-located with the runtime). The tool surface is identical —
 * one tool per workflow plus `relay_respond` — but the backing
 * implementation differs (HTTP calls vs direct function calls). Callers
 * provide a RelayMcpBackend with the concrete implementations.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { InputSchema } from "../../isomorphic/input";
import type { CallResponseResult } from "../../isomorphic/messages";
import { inputSchemaToZod } from "../../isomorphic/input-zod";
import { formatCallResponseForMcp } from "../../isomorphic/mcp-translation";

export type WorkflowInfo = {
  slug: string;
  title: string;
  description?: string;
  input?: InputSchema;
};

/** Backend that the tool registration delegates to for actual execution. */
export type RelayMcpBackend = {
  listWorkflows(): WorkflowInfo[] | Promise<WorkflowInfo[]>;
  startWorkflow(
    slug: string,
    data?: Record<string, unknown>,
  ): Promise<CallResponseResult>;
  respondToWorkflow(
    runId: string,
    event: string,
    data: Record<string, unknown>,
  ): Promise<CallResponseResult>;
};

/**
 * Register the standard Relay tools on the given MCP server:
 * - `relay_respond` — respond to a running workflow
 * - One tool per workflow (slug converted to underscores)
 */
export async function registerRelayTools(
  server: McpServer,
  backend: RelayMcpBackend,
) {
  server.registerTool(
    "relay_respond",
    {
      description:
        "Respond to a running workflow that is awaiting input or confirmation. " +
        "Use this after a workflow tool returns a paused state.",
      inputSchema: {
        runId: z
          .string()
          .describe("The runId from the previous workflow response"),
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
    },
    async ({ runId, event, data }) => {
      const result = await backend.respondToWorkflow(runId, event, data);
      return {
        content: [{ type: "text", text: formatCallResponseForMcp(result) }],
      };
    },
  );

  const workflows = await backend.listWorkflows();

  for (const workflow of workflows) {
    const toolName = workflow.slug.replace(/-/g, "_");
    const zodSchema = inputSchemaToZod(workflow.input);

    server.registerTool(
      toolName,
      {
        description:
          workflow.description || `Run the "${workflow.title}" workflow`,
        inputSchema: zodSchema,
      },
      async (params: Record<string, unknown>) => {
        const data = Object.keys(zodSchema).length > 0 ? params : undefined;
        const result = await backend.startWorkflow(workflow.slug, data);
        return {
          content: [{ type: "text", text: formatCallResponseForMcp(result) }],
        };
      },
    );
  }
}

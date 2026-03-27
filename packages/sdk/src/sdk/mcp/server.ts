import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallResponseResult } from "../../isomorphic/messages";
import {
  registerRelayTools,
  type WorkflowInfo,
  type RelayMcpBackend,
} from "./tools";

export type CreateRelayMcpServerOptions = {
  /** Base URL for the Relay API (e.g. "http://localhost:8787") */
  apiUrl: string;
  /** MCP server name (default: "relay") */
  name?: string;
  /** MCP server version (default: "0.1.0") */
  version?: string;
};

// ── Relay API client ─────────────────────────────────────────────

function createApiClient(apiUrl: string): RelayMcpBackend {
  return {
    async listWorkflows(): Promise<WorkflowInfo[]> {
      const res = await fetch(`${apiUrl}/workflows`);
      const data = (await res.json()) as { workflows: WorkflowInfo[] };
      return data.workflows;
    },

    async startWorkflow(
      slug: string,
      data?: Record<string, unknown>,
    ): Promise<CallResponseResult> {
      const res = await fetch(`${apiUrl}/api/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workflow: slug, data }),
      });
      return res.json() as Promise<CallResponseResult>;
    },

    async respondToWorkflow(
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
    },
  };
}

/**
 * Standalone MCP server for running locally (e.g. connecting Claude Desktop
 * to a running Relay instance). Talks to the Relay API over HTTP and
 * communicates with the MCP client over stdio. For the hosted Cloudflare
 * variant, see cf-mcp-agent.ts.
 */
export function createRelayMcpServer(options: CreateRelayMcpServerOptions) {
  const { apiUrl, name = "relay", version = "0.1.0" } = options;

  const server = new McpServer({ name, version });

  return {
    async start() {
      await registerRelayTools(server, createApiClient(apiUrl));
      const transport = new StdioServerTransport();
      await server.connect(transport);
    },
  };
}

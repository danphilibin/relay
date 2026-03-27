import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getWorkflowList } from "./registry";
import { startWorkflowRun, respondToWorkflowRun } from "./workflow-api";
import { registerRelayTools } from "./mcp/tools";

/**
 * Relay's hosted MCP endpoint on Cloudflare. Extends the Cloudflare agents
 * framework's McpAgent (a Durable Object that handles MCP transport over
 * HTTP/WebSocket instead of stdio) and registers the standard Relay workflow
 * tools on it. For the standalone local MCP server, see mcp/server.ts.
 */
export class RelayMcpAgent extends McpAgent<Env> {
  server = new McpServer({
    name: "relay",
    version: "0.1.0",
  });

  async init() {
    await registerRelayTools(this.server, {
      listWorkflows: () => getWorkflowList(),
      startWorkflow: (slug, data) => startWorkflowRun(this.env, slug, data),
      respondToWorkflow: (runId, event, data) =>
        respondToWorkflowRun(this.env, runId, event, data),
    });
  }
}

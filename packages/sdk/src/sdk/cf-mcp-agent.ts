import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { getWorkflowList } from "./registry";
import { startWorkflowRun, respondToWorkflowRun } from "./workflow-api";
import { inputSchemaToZod } from "./mcp";
import { formatCallResponseForMcp } from "../isomorphic/mcp-translation";

export class RelayMcpAgent extends McpAgent<Env> {
  server = new McpServer({
    name: "relay",
    version: "0.1.0",
  });

  async init() {
    // Register the generic respond tool
    this.server.tool(
      "relay_respond",
      "Respond to a running workflow that is awaiting input or confirmation. " +
        "Use this after a workflow tool returns a paused state.",
      {
        run_id: z
          .string()
          .describe("The run_id from the previous workflow response"),
        event: z
          .string()
          .describe(
            "The event name from the interaction (e.g. relay-input-1)",
          ),
        data: z
          .record(z.string(), z.unknown())
          .describe(
            'Response data. For input: the field values (e.g. {"input": "hello"}). ' +
              'For confirm: {"approved": true} or {"approved": false}.',
          ),
      },
      async ({ run_id, event, data }) => {
        const result = await respondToWorkflowRun(
          this.env,
          run_id,
          event,
          data,
        );
        return {
          content: [{ type: "text", text: formatCallResponseForMcp(result) }],
        };
      },
    );

    // Register one tool per workflow
    for (const workflow of getWorkflowList()) {
      const toolName = workflow.slug.replace(/-/g, "_");
      const description =
        workflow.description || `Run the "${workflow.title}" workflow`;
      const zodSchema = inputSchemaToZod(workflow.input);

      this.server.tool(
        toolName,
        description,
        zodSchema,
        async (params: Record<string, unknown>) => {
          const data = Object.keys(zodSchema).length > 0 ? params : undefined;
          const result = await startWorkflowRun(
            this.env,
            workflow.slug,
            data,
          );
          return {
            content: [
              { type: "text", text: formatCallResponseForMcp(result) },
            ],
          };
        },
      );
    }
  }
}

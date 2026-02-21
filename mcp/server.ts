/**
 * MCP server that exposes Relay workflows as tools.
 *
 * Each workflow becomes a callable tool. Workflows with upfront input schemas
 * have those fields as tool parameters. Workflows without upfront input take
 * no parameters — the first interaction is returned in the tool result.
 *
 * A generic `relay_respond` tool handles mid-run interactions (input requests
 * and confirmations that happen during workflow execution).
 *
 * Usage:
 *   RELAY_API_URL=http://localhost:8787 npx tsx mcp/server.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const RELAY_API_URL = process.env.RELAY_API_URL || "http://localhost:8787";

// ── Relay API client ─────────────────────────────────────────────

type WorkflowInfo = {
  slug: string;
  title: string;
  description?: string;
  input?: Record<
    string,
    {
      type: string;
      label: string;
      description?: string;
      options?: { value: string; label: string }[];
    }
  >;
};

type CallResponseResult = {
  run_id: string;
  status: "awaiting_input" | "awaiting_confirm" | "complete";
  messages: any[];
  interaction: any | null;
};

async function fetchWorkflows(): Promise<WorkflowInfo[]> {
  const res = await fetch(`${RELAY_API_URL}/workflows`);
  const data = (await res.json()) as { workflows: WorkflowInfo[] };
  return data.workflows;
}

async function startWorkflow(
  slug: string,
  data?: Record<string, unknown>,
): Promise<CallResponseResult> {
  const res = await fetch(`${RELAY_API_URL}/api/run`, {
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
  const res = await fetch(`${RELAY_API_URL}/api/run/${runId}/respond`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, data }),
  });
  return res.json() as Promise<CallResponseResult>;
}

// ── InputSchema → Zod schema conversion ──────────────────────────

function inputSchemaToZod(
  input: WorkflowInfo["input"],
): Record<string, z.ZodType> {
  if (!input) return {};

  const shape: Record<string, z.ZodType> = {};
  for (const [key, field] of Object.entries(input)) {
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
          .enum(field.options!.map((o) => o.value) as [string, ...string[]])
          .describe(desc);
        break;
    }
  }
  return shape;
}

// ── Format result for LLM consumption ────────────────────────────

function formatResult(result: CallResponseResult): string {
  const lines: string[] = [];

  // Include log messages as context
  for (const msg of result.messages) {
    if (msg.type === "log") {
      lines.push(msg.text);
    }
  }

  if (result.status === "complete") {
    lines.push("\n[Workflow complete]");
  } else if (result.interaction) {
    lines.push(`\n[Workflow paused — ${result.status}]`);
    lines.push(`Run ID: ${result.run_id}`);
    lines.push(`Event: ${result.interaction.id}`);

    if (result.interaction.type === "input_request") {
      lines.push(`Prompt: ${result.interaction.prompt}`);
      if (result.interaction.schema) {
        lines.push("Fields:");
        for (const [key, field] of Object.entries(
          result.interaction.schema,
        ) as [string, any][]) {
          let fieldDesc = `  - ${key} (${field.type}): ${field.description || field.label}`;
          if (field.options) {
            fieldDesc += ` [options: ${field.options.map((o: any) => o.value).join(", ")}]`;
          }
          lines.push(fieldDesc);
        }
      }
    } else if (result.interaction.type === "confirm_request") {
      lines.push(`Confirm: ${result.interaction.message}`);
    }

    lines.push("\nUse relay_respond to continue this workflow.");
  }

  return lines.join("\n");
}

// ── MCP server setup ─────────────────────────────────────────────

const server = new McpServer({
  name: "relay",
  version: "0.1.0",
});

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
    const result = await respondToWorkflow(run_id, event, data);
    return { content: [{ type: "text", text: formatResult(result) }] };
  },
);

// Dynamically register a tool for each workflow
async function registerWorkflowTools() {
  const workflows = await fetchWorkflows();

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
        const result = await startWorkflow(workflow.slug, data);
        return { content: [{ type: "text", text: formatResult(result) }] };
      },
    );
  }
}

// ── Start ────────────────────────────────────────────────────────

async function main() {
  await registerWorkflowTools();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

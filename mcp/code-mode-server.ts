/**
 * Code Mode MCP server for Relay workflows.
 *
 * Instead of one tool per workflow (N+1 tools), this server exposes two tools:
 *   - list_workflows: returns a TypeScript API definition generated from the registry
 *   - execute: runs JavaScript code against a typed `relay` object
 *
 * The LLM writes code instead of making tool calls — better for composing
 * multi-step workflows, conditional logic, and batch operations.
 *
 * Inspired by Cloudflare's Code Mode pattern:
 * https://blog.cloudflare.com/code-mode/
 *
 * Usage:
 *   RELAY_API_URL=http://localhost:8787 npx tsx mcp/code-mode-server.ts
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import vm from "node:vm";

const RELAY_API_URL = process.env.RELAY_API_URL || "http://localhost:8787";

// ── Relay API types ─────────────────────────────────────────────

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

// ── Relay API client ────────────────────────────────────────────

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

// ── TypeScript API generation ───────────────────────────────────

function slugToCamelCase(slug: string): string {
  return slug.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

const TS_TYPE_MAP: Record<string, string> = {
  text: "string",
  number: "number",
  checkbox: "boolean",
  select: "string",
};

/**
 * Generates TypeScript type definitions from the workflow registry.
 * This gets returned by list_workflows and loaded into the LLM's context.
 */
function generateTypeScriptAPI(workflows: WorkflowInfo[]): string {
  const lines: string[] = [];

  // WorkflowRun interface — the return type of every relay method
  lines.push(`interface WorkflowRun {`);
  lines.push(`  runId: string;`);
  lines.push(`  status: "awaiting_input" | "awaiting_confirm" | "complete";`);
  lines.push(`  messages: { type: string; text?: string }[];`);
  lines.push(`  interaction: {`);
  lines.push(`    id: string;`);
  lines.push(`    type: "input_request" | "confirm_request";`);
  lines.push(`    /** The prompt shown to the user (input_request) */`);
  lines.push(`    prompt?: string;`);
  lines.push(`    /** The confirmation message (confirm_request) */`);
  lines.push(`    message?: string;`);
  lines.push(`    /** Field definitions for input_request */`);
  lines.push(`    schema?: Record<string, {`);
  lines.push(`      type: string; label: string;`);
  lines.push(`      options?: { value: string; label: string }[];`);
  lines.push(`    }>;`);
  lines.push(`  } | null;`);
  lines.push(
    `  /** Respond to the current interaction and advance the workflow. */`,
  );
  lines.push(
    `  /** For input_request: pass field values, e.g. { name: "Alice" } */`,
  );
  lines.push(
    `  /** For confirm_request: pass { approved: true } or { approved: false } */`,
  );
  lines.push(`  respond(data: Record<string, unknown>): Promise<WorkflowRun>;`);
  lines.push(`}`);
  lines.push(``);

  // relay object declaration — one method per workflow
  lines.push(`declare const relay: {`);
  for (const wf of workflows) {
    const method = slugToCamelCase(wf.slug);
    const desc = wf.description || `Run the "${wf.title}" workflow`;
    lines.push(`  /** ${desc} */`);

    if (wf.input && Object.keys(wf.input).length > 0) {
      const params = Object.entries(wf.input)
        .map(
          ([key, field]) => `${key}: ${TS_TYPE_MAP[field.type] || "unknown"}`,
        )
        .join("; ");
      lines.push(`  ${method}(input: { ${params} }): Promise<WorkflowRun>;`);
    } else {
      lines.push(`  ${method}(): Promise<WorkflowRun>;`);
    }
  }
  lines.push(`};`);

  return lines.join("\n");
}

// ── Relay runtime object ────────────────────────────────────────

/** Wraps a raw API result with a chainable .respond() method. */
function wrapResult(result: CallResponseResult): Record<string, any> {
  return {
    runId: result.run_id,
    status: result.status,
    messages: result.messages,
    interaction: result.interaction,
    respond: async (data: Record<string, unknown>) => {
      if (!result.interaction) {
        throw new Error("No pending interaction to respond to");
      }
      const next = await respondToWorkflow(
        result.run_id,
        result.interaction.id,
        data,
      );
      return wrapResult(next);
    },
  };
}

/** Builds the `relay` object that gets injected into the code sandbox. */
function buildRelayObject(workflows: WorkflowInfo[]): Record<string, Function> {
  const relay: Record<string, Function> = {};
  for (const wf of workflows) {
    const method = slugToCamelCase(wf.slug);
    relay[method] = async (input?: Record<string, unknown>) => {
      const result = await startWorkflow(wf.slug, input);
      return wrapResult(result);
    };
  }
  return relay;
}

// ── MCP server ──────────────────────────────────────────────────

const server = new McpServer({
  name: "relay-code-mode",
  version: "0.1.0",
});

// Cache workflows, generated TypeScript, and relay object
let cache: {
  workflows: WorkflowInfo[];
  typeScript: string;
  relay: Record<string, Function>;
} | null = null;

async function init() {
  if (!cache) {
    const workflows = await fetchWorkflows();
    cache = {
      workflows,
      typeScript: generateTypeScriptAPI(workflows),
      relay: buildRelayObject(workflows),
    };
  }
  return cache;
}

// Tool 1: Discover the API
server.tool(
  "list_workflows",
  "Returns the TypeScript API definition for all available Relay workflows. " +
    "Call this first to discover available workflows and their parameter types. " +
    "The returned TypeScript describes the `relay` object available in the `execute` tool.",
  {},
  async () => {
    const { typeScript } = await init();
    return {
      content: [{ type: "text", text: typeScript }],
    };
  },
);

// Tool 2: Execute code against the API
server.tool(
  "execute",
  "Execute JavaScript code against the Relay workflow API. " +
    "Write code using the `relay` object (call list_workflows first to see the API). " +
    "Top-level await is supported. Use console.log() for output. Return values are also captured.",
  {
    code: z
      .string()
      .describe(
        "JavaScript code to execute. Top-level await is supported. " +
          "The `relay` object is in scope with methods for each workflow. " +
          "Example: const run = await relay.askName(); console.log(run.status);",
      ),
  },
  async ({ code }) => {
    const { relay } = await init();

    const logs: string[] = [];
    const sandbox = {
      relay,
      console: {
        log: (...args: any[]) => {
          logs.push(
            args
              .map((a) =>
                typeof a === "string" ? a : JSON.stringify(a, null, 2),
              )
              .join(" "),
          );
        },
      },
    };

    try {
      const wrapped = `(async () => {\n${code}\n})()`;
      const context = vm.createContext(sandbox);
      const result = await Promise.race([
        vm.runInNewContext(wrapped, context),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Execution timed out")), 30_000),
        ),
      ]);

      const parts: string[] = [];
      if (logs.length) parts.push(logs.join("\n"));
      if (result !== undefined) {
        parts.push(
          typeof result === "string" ? result : JSON.stringify(result, null, 2),
        );
      }

      return {
        content: [{ type: "text", text: parts.join("\n\n") || "(no output)" }],
      };
    } catch (err: any) {
      return {
        content: [{ type: "text", text: `Error: ${err.message}` }],
        isError: true,
      };
    }
  },
);

// ── Start ───────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);

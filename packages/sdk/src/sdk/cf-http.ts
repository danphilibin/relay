import { getTableRenderer, getWorkflow, getWorkflowList } from "./registry";
import {
  WorkflowParamsSchema,
  type StartWorkflowParams,
} from "../isomorphic/registry-types";
import type {
  LoaderTableData,
  SerializedColumnDef,
} from "../isomorphic/output";
import {
  startWorkflowRun,
  respondToWorkflowRun,
  WorkflowNotFoundError,
} from "./workflow-api";
import { RelayMcpAgent } from "./cf-mcp-agent";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function normalizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    const obj = value as { label?: string; value?: string };
    return obj.label ?? obj.value ?? JSON.stringify(value);
  }
  return String(value);
}

function deriveColumnKey(column: SerializedColumnDef, index: number): string {
  if (column.type === "accessor") {
    return column.accessorKey;
  }
  return `render_${index}`;
}

/**
 * HTTP handler for the Relay workflow engine.
 *
 * Interactive endpoints (browser clients):
 * - GET  /workflows              - lists available workflows
 * - POST /workflows              - spawns a new workflow instance
 * - GET  /workflows/:id/stream   - connects to NDJSON stream
 * - POST /workflows/:id/event/:name - submits an event
 *
 * Call-response endpoints (agents):
 * - POST /api/run                - start a workflow, block until first interaction
 * - POST /api/run/:id/respond    - submit a response, block until next interaction
 */
function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(corsHeaders)) {
    headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export const httpHandler = async (
  req: Request,
  env: Env,
  ctx: ExecutionContext,
) => {
  // Auto-route /mcp when RELAY_MCP_AGENT binding is present
  if (env.RELAY_MCP_AGENT) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/mcp")) {
      return RelayMcpAgent.serve("/mcp", { binding: "RELAY_MCP_AGENT" }).fetch(
        req,
        env,
        ctx,
      );
    }
  }

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const response = await handleRequest(req, env);
  return withCors(response);
};

async function handleRequest(req: Request, env: Env): Promise<Response> {
  const url = new URL(req.url);

  // ── Call-response API (agents) ─────────────────────────────────

  // POST /api/run - start a workflow and block until first interaction point
  if (req.method === "POST" && url.pathname === "/api/run") {
    const body = await req.json<{
      workflow: string;
      data?: Record<string, unknown>;
    }>();

    try {
      const result = await startWorkflowRun(env, body.workflow, body.data);
      return Response.json(result);
    } catch (e) {
      if (e instanceof WorkflowNotFoundError) {
        return Response.json({ error: e.message }, { status: 404 });
      }
      throw e;
    }
  }

  // POST /api/run/:id/respond - submit a response and block until next interaction
  const respondMatch = url.pathname.match(/^\/api\/run\/([^/]+)\/respond$/);
  if (req.method === "POST" && respondMatch) {
    const [, instanceId] = respondMatch;
    const body = await req.json<{
      event: string;
      data: Record<string, unknown>;
    }>();

    const result = await respondToWorkflowRun(
      env,
      instanceId,
      body.event,
      body.data,
    );
    return Response.json(result);
  }

  // ── Interactive API (browser clients) ──────────────────────────

  // GET /workflows - lists available workflows
  if (req.method === "GET" && url.pathname === "/workflows") {
    return Response.json({ workflows: getWorkflowList() });
  }

  // POST /workflows - spawns a new workflow instance
  if (url.pathname === "/workflows") {
    const params = WorkflowParamsSchema.parse(await req.json());
    const instance = await env.RELAY_WORKFLOW.create({ params });
    return Response.json({
      id: instance.id,
      name: params.name,
    } satisfies StartWorkflowParams);
  }

  // GET /workflows/:id/stream - connects to workflow stream
  const streamMatch = url.pathname.match(/^\/workflows\/([^/]+)\/stream$/);
  if (streamMatch) {
    const [, workflowId] = streamMatch;
    const stub = env.RELAY_DURABLE_OBJECT.getByName(workflowId);
    return stub.fetch("http://internal/stream");
  }

  // POST /workflows/:id/event/:name - submits an event to a workflow
  const eventMatch = url.pathname.match(
    /^\/workflows\/([^/]+)\/event\/([^/]+)$/,
  );
  if (req.method === "POST" && eventMatch) {
    const [, instanceId, eventName] = eventMatch;
    const body = await req.json<{ value?: any; approved?: boolean }>();

    const stub = env.RELAY_DURABLE_OBJECT.getByName(instanceId);

    // Determine message type based on payload shape
    const isConfirm = typeof body.approved === "boolean";
    const streamMessage = isConfirm
      ? { type: "confirm_received", id: eventName, approved: body.approved }
      : { type: "input_received", id: eventName, value: body.value };

    await stub.fetch("http://internal/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: streamMessage }),
    });

    // Send event to workflow engine
    const instance = await env.RELAY_WORKFLOW.get(instanceId);
    await instance.sendEvent({
      type: eventName,
      payload: isConfirm ? { approved: body.approved } : body.value,
    });

    return Response.json({ success: true });
  }

  // POST /workflows/:id/table/:stepId/query - fetch paginated table data
  const tableQueryMatch = url.pathname.match(
    /^\/workflows\/([^/]+)\/table\/([^/]+)\/query$/,
  );
  if (req.method === "POST" && tableQueryMatch) {
    const [, runId, stepId] = tableQueryMatch;
    const stub = env.RELAY_DURABLE_OBJECT.getByName(runId);
    const descriptorResponse = await stub.fetch(
      `http://internal/tables/${stepId}`,
    );

    if (!descriptorResponse.ok) {
      return Response.json(
        { error: `Unknown table descriptor: ${stepId}` },
        { status: 404 },
      );
    }

    const descriptor = (await descriptorResponse.json()) as {
      workflowSlug: string;
      loaderName: string;
      params: Record<string, unknown>;
      tableRendererName?: string;
      columns?: SerializedColumnDef[];
      pageSize?: number;
    };

    const definition = getWorkflow(descriptor.workflowSlug);

    if (!definition) {
      return Response.json(
        { error: `Unknown workflow: ${descriptor.workflowSlug}` },
        { status: 404 },
      );
    }

    const loaderDef = definition.loaders?.[descriptor.loaderName];
    if (!loaderDef) {
      return Response.json(
        { error: `Unknown loader: ${descriptor.loaderName}` },
        { status: 404 },
      );
    }

    const body = await req.json<{
      page?: number;
      pageSize?: number;
      query?: string;
    }>();
    const page = body.page ?? 0;
    const pageSize = body.pageSize ?? descriptor.pageSize ?? 20;
    const query = body.query || undefined;

    const result = await loaderDef.fn(
      { ...descriptor.params, query, page, pageSize },
      env,
    );
    const renderer = descriptor.tableRendererName
      ? getTableRenderer(descriptor.tableRendererName)
      : undefined;
    const normalizedColumns =
      descriptor.columns?.map((column, index) => ({
        key: deriveColumnKey(column, index),
        label: column.label,
      })) ??
      (result.data[0]
        ? Object.keys(result.data[0] as Record<string, unknown>).map((key) => ({
            key,
            label: key,
          }))
        : []);

    const payload: LoaderTableData = {
      columns: normalizedColumns,
      rows: result.data.map((row: any) => {
        const cells = Object.fromEntries(
          normalizedColumns.map((column, index) => {
            const sourceColumn = descriptor.columns?.[index];
            const rendererColumn = renderer?.columns[index];

            let value: unknown;
            if (rendererColumn) {
              if (typeof rendererColumn === "string") {
                value = row[rendererColumn];
              } else if ("accessorKey" in rendererColumn) {
                value = row[rendererColumn.accessorKey];
              } else {
                value = rendererColumn.renderCell(row);
              }
            } else if (sourceColumn?.type === "accessor") {
              value = row[sourceColumn.accessorKey];
            } else {
              value = row[column.key];
            }

            return [column.key, normalizeCellValue(value)];
          }),
        );

        // Row keys are identity values — preserve their original primitive type
        // (string or number) rather than coercing through display normalization.
        const rawKey = loaderDef.rowKey ? row[loaderDef.rowKey] : undefined;
        const rowKey =
          typeof rawKey === "string" || typeof rawKey === "number"
            ? rawKey
            : rawKey != null
              ? String(rawKey)
              : undefined;

        return { rowKey, cells };
      }),
      totalCount: result.totalCount,
    };

    return Response.json(payload);
  }

  return new Response("Not Found", { status: 404 });
}

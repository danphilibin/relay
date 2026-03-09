import { getPresenter, getWorkflow, getWorkflowList } from "./registry";
import {
  WorkflowParamsSchema,
  type StartWorkflowParams,
} from "../isomorphic/registry-types";
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

  // GET /workflows/:slug/loader/:name - fetch paginated data from a loader
  const loaderMatch = url.pathname.match(
    /^\/workflows\/([^/]+)\/loader\/([^/]+)$/,
  );
  if (req.method === "GET" && loaderMatch) {
    const [, workflowSlug, loaderName] = loaderMatch;
    const definition = getWorkflow(workflowSlug);

    if (!definition) {
      return Response.json(
        { error: `Unknown workflow: ${workflowSlug}` },
        { status: 404 },
      );
    }

    const loaderDef = definition.loaders?.[loaderName];
    if (!loaderDef) {
      return Response.json(
        { error: `Unknown loader: ${loaderName}` },
        { status: 404 },
      );
    }

    // Parse pagination params from query string
    const page = parseInt(url.searchParams.get("page") ?? "0", 10);
    const pageSize = parseInt(url.searchParams.get("pageSize") ?? "20", 10);
    const query = url.searchParams.get("query") ?? undefined;
    // These query params are added by buildLoaderPath(). The browser does not
    // need to know what they mean; it just uses the path the SDK gave it.
    const stepId = url.searchParams.get("stepId") ?? undefined;
    const presenterName = url.searchParams.get("presenter") ?? undefined;

    // Parse custom params from the descriptor
    const customParams: Record<string, unknown> = {};
    if (loaderDef.paramDescriptor) {
      for (const [key, type] of Object.entries(loaderDef.paramDescriptor)) {
        const raw = url.searchParams.get(key);
        if (raw !== null) {
          if (type === "number") {
            customParams[key] = parseFloat(raw);
          } else if (type === "boolean") {
            customParams[key] = raw === "true";
          } else {
            customParams[key] = raw;
          }
        }
      }
    }

    const result = await loaderDef.fn(
      { ...customParams, query, page, pageSize },
      env,
    );

    // Named presenters are globally reusable and don't depend on per-run state.
    if (presenterName) {
      const tablePresenter = getPresenter(presenterName);
      if (tablePresenter && result.data.length > 0) {
        result.data = result.data.map((row: any) => {
          const transformed = { ...row };
          // Keep computed cell output separate from the source row so the UI can
          // render rich columns without losing access to the original fields.
          tablePresenter.columns.forEach((col: any, index) => {
            if (typeof col !== "string" && "renderCell" in col) {
              // The index here must stay aligned with serializeColumns() so the
              // browser knows which computed display value belongs to which
              // column.
              transformed[`__render_${index}`] = col.renderCell(row);
            }
          });
          return transformed;
        });
      }
    }

    return Response.json(result);
  }

  return new Response("Not Found", { status: 404 });
}

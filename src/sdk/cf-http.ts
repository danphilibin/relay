import { getWorkflowList, getWorkflow, slugify } from "./registry";
import {
  WorkflowParamsSchema,
  type StartWorkflowParams,
} from "@/isomorphic/registry-types";
import {
  type StreamMessage,
  type CallResponseResult,
  type InteractionPoint,
  interactionStatus,
} from "@/isomorphic/messages";

/**
 * Consume an NDJSON stream from the DO, collecting messages until we hit
 * an unanswered interaction point (input_request, confirm_request, or workflow_complete).
 * Optionally skips past messages until `afterId` is found.
 */
async function consumeUntilInteraction(
  streamResponse: Response,
  afterId?: string,
): Promise<{ messages: StreamMessage[]; interaction: InteractionPoint }> {
  const reader = streamResponse.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const messages: StreamMessage[] = [];
  let pastAfter = !afterId; // if no afterId, start collecting immediately

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop()!; // keep incomplete line in buffer

      for (const line of lines) {
        if (!line.trim()) continue;
        const msg = JSON.parse(line) as StreamMessage;
        messages.push(msg);

        // Skip past already-seen messages
        if (!pastAfter) {
          if (msg.id === afterId) pastAfter = true;
          continue;
        }

        if (msg.type === "input_request" || msg.type === "confirm_request") {
          reader.cancel();
          return { messages, interaction: msg };
        }
        if (msg.type === "workflow_complete") {
          reader.cancel();
          return { messages, interaction: null };
        }
      }
    }
  } catch (e) {
    reader.cancel();
    throw e;
  }

  // Stream ended without an interaction point (shouldn't happen in normal flow)
  return { messages, interaction: null };
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
export const httpHandler = async (req: Request, env: Env) => {
  const url = new URL(req.url);

  // ── Call-response API (agents) ─────────────────────────────────

  // POST /api/run - start a workflow and block until first interaction point
  if (req.method === "POST" && url.pathname === "/api/run") {
    const body = await req.json<{
      workflow: string;
      data?: Record<string, unknown>;
    }>();
    const slug = slugify(body.workflow);
    const definition = getWorkflow(slug);

    if (!definition) {
      return Response.json(
        { error: `Unknown workflow: ${body.workflow}` },
        { status: 404 },
      );
    }

    // Create workflow instance — pass slug as name (used by getWorkflow lookup)
    const params = { name: slug, data: body.data };
    const instance = await env.RELAY_WORKFLOW.create({ params });

    // Open stream and consume until first interaction point
    const stub = env.RELAY_DURABLE_OBJECT.getByName(instance.id);
    const streamResponse = await stub.fetch("http://internal/stream");
    const { messages, interaction } =
      await consumeUntilInteraction(streamResponse);

    return Response.json({
      run_id: instance.id,
      status: interactionStatus(interaction),
      messages,
      interaction,
    } satisfies CallResponseResult);
  }

  // POST /api/run/:id/respond - submit a response and block until next interaction
  const respondMatch = url.pathname.match(/^\/api\/run\/([^/]+)\/respond$/);
  if (req.method === "POST" && respondMatch) {
    const [, instanceId] = respondMatch;
    const body = await req.json<{
      event: string;
      data: Record<string, unknown>;
    }>();

    const stub = env.RELAY_DURABLE_OBJECT.getByName(instanceId);

    // Open stream BEFORE submitting the event so we don't miss messages
    const streamResponse = await stub.fetch("http://internal/stream");

    // Determine message type based on payload shape
    const isConfirm = typeof body.data.approved === "boolean";
    const streamMessage = isConfirm
      ? {
          type: "confirm_received",
          id: body.event,
          approved: body.data.approved,
        }
      : { type: "input_received", id: body.event, value: body.data };

    // Record the response in the stream
    await stub.fetch("http://internal/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: streamMessage }),
    });

    // Resume the workflow
    const instance = await env.RELAY_WORKFLOW.get(instanceId);
    await instance.sendEvent({
      type: body.event,
      payload: isConfirm ? { approved: body.data.approved } : body.data,
    });

    // Consume stream until next interaction point, skipping past the event we just submitted
    const { messages, interaction } = await consumeUntilInteraction(
      streamResponse,
      body.event,
    );

    return Response.json({
      run_id: instanceId,
      status: interactionStatus(interaction),
      messages,
      interaction,
    } satisfies CallResponseResult);
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

  return new Response("Not Found", { status: 404 });
};

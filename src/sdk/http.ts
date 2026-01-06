import { StartWorkflowParams, WorkflowParamsSchema } from "./stream";

/**
 * HTTP handler for the Relay workflow engine.
 *
 * Provides the following endpoints:
 * - GET  /workflows - lists available workflows
 * - POST /workflows - spawns a new workflow instance
 * - GET  /workflows/:id/stream - connects to workflow stream
 * - POST /workflows/:id/event/:name - submits an event to a workflow
 */
export const httpHandler = async (req: Request, env: Env) => {
  const url = new URL(req.url);

  // GET /workflows - lists available workflows
  if (req.method === "GET" && url.pathname === "/workflows") {
    const { getWorkflowTypes } = await import("../registry");
    return Response.json({ workflows: getWorkflowTypes() });
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
    const body = await req.json<{ value: any }>();

    // Write input_received to the stream
    const stub = env.RELAY_DURABLE_OBJECT.getByName(instanceId);
    await stub.fetch("http://internal/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: { type: "input_received", value: body.value },
      }),
    });

    // Send event to workflow engine
    const instance = await env.RELAY_WORKFLOW.get(instanceId);
    await instance.sendEvent({
      type: eventName,
      payload: body.value,
    });

    return Response.json({ success: true });
  }

  return new Response("Not Found", { status: 404 });
};

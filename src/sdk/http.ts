export const httpHandler = async (req: Request, env: Env) => {
  const url = new URL(req.url);

  // GET /stream/:id - connect to workflow stream
  const streamMatch = url.pathname.match(/^\/stream\/(.+)$/);
  if (streamMatch) {
    const workflowId = streamMatch[1];
    const stub = env.RELAY_DURABLE_OBJECT.getByName(workflowId);
    return stub.fetch("http://internal/stream");
  }

  // GET /workflows - list available workflows
  if (req.method === "GET" && url.pathname === "/workflows") {
    const { getWorkflowTypes } = await import("../registry");
    return Response.json({ workflows: getWorkflowTypes() });
  }

  // POST /workflow - spawn a new workflow instance
  if (req.method === "POST" && url.pathname === "/workflow") {
    const body = await req.json<{ type: string; params?: any }>();
    const instance = await env.RELAY_WORKFLOW.create({
      params: {
        type: body.type,
        params: body.params || {},
      },
    });
    return Response.json({
      id: instance.id,
      streamUrl: `/stream/${instance.id}`,
      type: body.type,
    });
  }

  // POST /workflow/:id/event/:name - submit event to workflow
  const eventMatch = url.pathname.match(
    /^\/workflow\/([^/]+)\/event\/([^/]+)$/,
  );
  if (req.method === "POST" && eventMatch) {
    const [, instanceId, eventName] = eventMatch;
    const body = await req.json<{ value: any }>();

    // Write input_received to the stream
    const stub = env.RELAY_DURABLE_OBJECT.getByName(instanceId);
    await stub.fetch("http://internal/write", {
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

import { WorkflowEvent, WorkflowStep } from "cloudflare:workers";
import { RelayWorkflowEntrypoint } from "./relay";
import { WorkflowObject } from "./workflow-object";
import { workflows } from "./workflows";
import html from "./index.html";

// Export the Durable Object
export { WorkflowObject };

// Params passed to workflows
type Params = {
  type: string;
  params?: any;
};

export class RelayWorkflow extends RelayWorkflowEntrypoint<Env, Params> {
  async run(event: WorkflowEvent<Params>, step: WorkflowStep) {
    this.initRelay(event.instanceId, this.env.WORKFLOW_OBJECT, step);

    const { type, params } = event.payload;
    const handler = workflows[type];

    if (!handler) {
      await this.relay.output(`Error: Unknown workflow type: ${type}`);
      throw new Error(`Unknown workflow type: ${type}`);
    }

    await handler({ step, relay: this.relay, params });
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname.startsWith("/favicon")) {
      return Response.json({}, { status: 404 });
    }

    // GET / - serve the frontend
    if (url.pathname === "/") {
      return new Response(html, {
        headers: { "Content-Type": "text/html" },
      });
    }

    // GET /stream/:id - connect to workflow stream
    const streamMatch = url.pathname.match(/^\/stream\/(.+)$/);
    if (streamMatch) {
      const workflowId = streamMatch[1];
      const stub = env.WORKFLOW_OBJECT.getByName(workflowId);
      return stub.fetch("http://internal/stream");
    }

    // GET /workflows - list available workflows
    if (req.method === "GET" && url.pathname === "/workflows") {
      const { getWorkflowTypes } = await import("./workflows");
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

      const instance = await env.RELAY_WORKFLOW.get(instanceId);
      await instance.sendEvent({
        type: eventName,
        payload: body.value,
      });

      return Response.json({ success: true });
    }

    // Default: return OK for any other requests
    return new Response("OK", { status: 200 });
  },
};

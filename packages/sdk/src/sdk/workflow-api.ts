import { getWorkflow, slugify } from "./registry";
import {
  type StreamMessage,
  type CallResponseResult,
  type InteractionPoint,
  interactionStatus,
} from "../isomorphic/messages";

/**
 * Consume an NDJSON stream from the DO, collecting messages until we hit
 * an unanswered interaction point (input_request, confirm_request, or workflow_complete).
 * Optionally skips past messages until `afterId` is found.
 */
export async function consumeUntilInteraction(
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

function buildRunUrl(
  appUrl: string,
  slug: string,
  runId: string,
): string | null {
  if (!appUrl) return null;
  const base = appUrl.replace(/\/$/, "");
  return `${base}/${slug}/${runId}`;
}

/**
 * Start a workflow run and block until the first interaction point.
 */
export async function startWorkflowRun(
  env: Env,
  slugOrTitle: string,
  data?: Record<string, unknown>,
): Promise<CallResponseResult> {
  const slug = slugify(slugOrTitle);
  const definition = getWorkflow(slug);

  if (!definition) {
    throw new WorkflowNotFoundError(slugOrTitle);
  }

  // Create workflow instance — pass slug as name (used by getWorkflow lookup)
  const params = { name: slug, data };
  const instance = await env.RELAY_WORKFLOW.create({ params });

  // Open stream and consume until first interaction point
  const stub = env.RELAY_DURABLE_OBJECT.getByName(instance.id);

  // Store workflow slug in the DO for later retrieval (e.g. respond calls)
  await stub.fetch("http://internal/metadata", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug }),
  });

  const streamResponse = await stub.fetch("http://internal/stream");
  const { messages, interaction } =
    await consumeUntilInteraction(streamResponse);

  return {
    run_id: instance.id,
    workflow_slug: slug,
    run_url: buildRunUrl(env.RELAY_APP_URL, slug, instance.id),
    status: interactionStatus(interaction),
    messages,
    interaction,
  };
}

/**
 * Respond to a running workflow and block until the next interaction point.
 */
export async function respondToWorkflowRun(
  env: Env,
  runId: string,
  event: string,
  data: Record<string, unknown>,
): Promise<CallResponseResult> {
  const stub = env.RELAY_DURABLE_OBJECT.getByName(runId);

  // Retrieve the workflow slug stored at run creation
  const metaResponse = await stub.fetch("http://internal/metadata");
  const { slug } = (await metaResponse.json()) as { slug: string | null };

  // Open stream BEFORE submitting the event so we don't miss messages
  const streamResponse = await stub.fetch("http://internal/stream");

  // Determine message type based on payload shape
  const isConfirm = typeof data.approved === "boolean";
  const streamMessage = isConfirm
    ? { type: "confirm_received", id: event, approved: data.approved }
    : { type: "input_received", id: event, value: data };

  // Record the response in the stream
  await stub.fetch("http://internal/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: streamMessage }),
  });

  // Resume the workflow
  const instance = await env.RELAY_WORKFLOW.get(runId);
  await instance.sendEvent({
    type: event,
    payload: isConfirm ? { approved: data.approved } : data,
  });

  // Consume stream until next interaction point, skipping past the event we just submitted
  const { messages, interaction } = await consumeUntilInteraction(
    streamResponse,
    event,
  );

  return {
    run_id: runId,
    workflow_slug: slug ?? "",
    run_url: slug ? buildRunUrl(env.RELAY_APP_URL, slug, runId) : null,
    status: interactionStatus(interaction),
    messages,
    interaction,
  };
}

export class WorkflowNotFoundError extends Error {
  constructor(workflow: string) {
    super(`Unknown workflow: ${workflow}`);
    this.name = "WorkflowNotFoundError";
  }
}

import { getWorkflow, slugify } from "./registry";
import {
  type StreamMessage,
  type CallResponseResult,
  type InteractionPoint,
  interactionStatus,
} from "../isomorphic/messages";
import { getExecutorStub } from "./cf-executor";

/**
 * Read the executor's NDJSON stream and return once the run needs
 * something (input, confirmation) or finishes. Collects all messages
 * along the way. When `afterId` is provided, skips past already-seen
 * messages before looking for the next interaction point.
 */
async function getNextInteraction(
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

  throw new WorkflowStreamInterruptedError();
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

  // Create a unique run ID and get the executor DO
  const runId = crypto.randomUUID();
  const stub = getExecutorStub(env, runId);

  // Open the stream first so we continue blocking through any timer-based
  // suspensions and only return once the run reaches a real interaction point
  // or completion.
  const streamResponse = await stub.fetch("http://internal/stream");

  // Start execution. The executor may suspend on input, confirm, or sleep,
  // but the stream remains open across alarm-driven replays.
  await stub.fetch("http://internal/start", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ slug, runId, data }),
  });

  const { messages, interaction } = await getNextInteraction(streamResponse);

  return {
    runId,
    workflowSlug: slug,
    runUrl: buildRunUrl(env.RELAY_APP_URL, slug, runId),
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
  const stub = getExecutorStub(env, runId);

  // Retrieve the workflow slug stored at run creation
  const metaResponse = await stub.fetch("http://internal/metadata");
  const { slug } = (await metaResponse.json()) as { slug: string | null };

  // Open the stream before sending the response so we don't miss messages
  // emitted by the replay, including completions that happen after sleeps.
  const streamResponse = await stub.fetch("http://internal/stream");

  // Determine message type based on payload shape
  const isConfirm = typeof data.approved === "boolean";
  const streamMessage = isConfirm
    ? { type: "confirm_received", id: event, approved: data.approved }
    : { type: "input_received", id: event, value: data };

  // Record the response in the stream (so browser clients see it)
  await stub.fetch("http://internal/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: streamMessage }),
  });

  // Deliver the event to the executor. The replay may suspend on a timer,
  // so the stream is the source of truth for "next interaction or complete".
  const eventPayload = isConfirm ? { approved: data.approved } : data;
  await stub.fetch(`http://internal/event/${encodeURIComponent(event)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(eventPayload),
  });

  const { messages, interaction } = await getNextInteraction(
    streamResponse,
    event,
  );

  return {
    runId,
    workflowSlug: slug ?? "",
    runUrl: slug ? buildRunUrl(env.RELAY_APP_URL, slug, runId) : null,
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

export class WorkflowStreamInterruptedError extends Error {
  constructor() {
    super("Stream interrupted");
    this.name = "WorkflowStreamInterruptedError";
  }
}

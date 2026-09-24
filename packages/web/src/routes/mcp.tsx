/**
 * Public MCP endpoint: forwards /mcp to the worker's /mcp (served by
 * RelayMcpAgent), so the home page can hand out a single URL on the
 * app's own origin for MCP clients to connect to.
 *
 * Only available in open-access mode. MCP clients can't carry the
 * WorkOS session cookie, so when auth is enabled this endpoint is
 * disabled entirely rather than exposing workflows unauthenticated.
 */
import { createFileRoute } from "@tanstack/react-router";
import { forwardToWorker } from "../lib/worker-proxy";
import { mintWorkerToken } from "../lib/token";

async function proxyMcp({ request }: { request: Request }): Promise<Response> {
  const { env } = await import("../env.server");

  if (env.WORKOS_CLIENT_ID) {
    return new Response("Not found", { status: 404 });
  }

  // The worker may still require a Bearer token (RELAY_SIGNING_KEY set)
  // even though the web app is open. Browsers get one from getToken();
  // MCP clients can't call that, so mint one here on their behalf.
  // Any Authorization header the client sent is replaced.
  const headers = new Headers(request.headers);
  const token = await mintWorkerToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  } else {
    headers.delete("Authorization");
  }

  return forwardToWorker(new Request(request, { headers }), "/mcp");
}

// Streamable HTTP transport uses POST for messages, GET for the
// server→client SSE stream, and DELETE to end a session.
export const Route = createFileRoute("/mcp")({
  server: {
    handlers: {
      GET: proxyMcp,
      POST: proxyMcp,
      DELETE: proxyMcp,
    },
  },
});

/**
 * Catch-all proxy route: forwards /worker/** requests to the relay
 * worker backend (RELAY_WORKER_URL). This keeps the worker URL
 * server-side only — the client never needs to know it.
 */
import { createFileRoute } from "@tanstack/react-router";

async function proxy({ request }: { request: Request }): Promise<Response> {
  const { env } = await import("../../env.server");
  const workerUrl = (env.RELAY_WORKER_URL ?? "").trim().replace(/\/+$/, "");

  if (!workerUrl) {
    return new Response(
      JSON.stringify({ error: "RELAY_WORKER_URL is not configured" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  if (env.WORKOS_CLIENT_ID) {
    const { getAuth } = await import("@workos/authkit-tanstack-react-start");
    const { user } = await getAuth();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Strip the /worker/ prefix to get the path the worker expects.
  const url = new URL(request.url);
  const targetPath = url.pathname.replace(/^\/worker\/?/, "/");
  const targetUrl = `${workerUrl}${targetPath}${url.search}`;

  let proxyResponse: Response;
  try {
    // Forward the request as-is (method, headers, body).
    // The Cloudflare Workers runtime handles streaming natively.
    proxyResponse = await fetch(targetUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      // @ts-expect-error — Cloudflare Workers supports duplex streaming
      duplex: "half",
    });
  } catch {
    return new Response(
      JSON.stringify({
        error: `Could not connect to worker. Is the worker running?`,
      }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  // Return the response directly, preserving status, headers, and
  // streaming body (important for NDJSON workflow streams).
  return new Response(proxyResponse.body, {
    status: proxyResponse.status,
    statusText: proxyResponse.statusText,
    headers: proxyResponse.headers,
  });
}

export const Route = createFileRoute("/worker/$")({
  server: {
    handlers: {
      GET: proxy,
      POST: proxy,
      PUT: proxy,
      PATCH: proxy,
      DELETE: proxy,
    },
  },
});

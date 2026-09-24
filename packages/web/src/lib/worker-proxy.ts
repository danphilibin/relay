/**
 * Server-side request forwarding to the relay worker (RELAY_WORKER_URL).
 * Shared by the /worker/** API proxy and the /mcp endpoint so the
 * worker URL never has to be exposed to browsers or MCP clients.
 *
 * Only call this from server route handlers — env.server is imported
 * dynamically to keep it out of the client module graph.
 */
export async function forwardToWorker(
  request: Request,
  targetPath: string,
): Promise<Response> {
  const { env } = await import("../env.server");
  const workerUrl = (env.RELAY_WORKER_URL ?? "").trim().replace(/\/+$/, "");

  if (!workerUrl) {
    return new Response(
      JSON.stringify({ error: "RELAY_WORKER_URL is not configured" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }

  const url = new URL(request.url);
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
  // streaming body (important for NDJSON workflow streams and MCP's
  // SSE responses).
  return new Response(proxyResponse.body, {
    status: proxyResponse.status,
    statusText: proxyResponse.statusText,
    headers: proxyResponse.headers,
  });
}

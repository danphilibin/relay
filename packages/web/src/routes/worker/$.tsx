/**
 * Catch-all proxy route: forwards /worker/** requests to the relay
 * worker backend (RELAY_WORKER_URL). This keeps the worker URL
 * server-side only — the client never needs to know it.
 */
import { createFileRoute } from "@tanstack/react-router";
import { forwardToWorker } from "../../lib/worker-proxy";

async function proxy({ request }: { request: Request }): Promise<Response> {
  const { env } = await import("../../env.server");

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
  return forwardToWorker(request, targetPath);
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

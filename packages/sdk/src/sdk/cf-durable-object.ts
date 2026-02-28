import { DurableObject } from "cloudflare:workers";
import { type StreamMessage } from "../isomorphic/messages";

/**
 * Durable Object that stores and streams messages for a workflow run.
 *
 * Endpoints:
 * - GET  /stream - NDJSON stream (replay + live) for browser clients and call-response consumers
 * - POST /stream - appends a message to the stream
 */
export class RelayDurableObject extends DurableObject {
  private controllers: ReadableStreamDefaultController<Uint8Array>[] = [];

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // POST /stream - append a message
    if (request.method === "POST" && url.pathname === "/stream") {
      const { message } = await request.json<{ message: StreamMessage }>();

      // Read existing messages from durable storage
      const messages =
        (await this.ctx.storage.get<StreamMessage[]>("messages")) || [];
      messages.push(message);

      // Persist to durable storage
      await this.ctx.storage.put("messages", messages);

      // Broadcast to all connected clients
      const encoded = new TextEncoder().encode(JSON.stringify(message) + "\n");
      for (const controller of this.controllers) {
        try {
          controller.enqueue(encoded);
        } catch {
          // Controller might be closed, ignore
        }
      }

      return new Response("OK");
    }

    // GET /stream - return a ReadableStream
    if (request.method === "GET" && url.pathname === "/stream") {
      let streamController: ReadableStreamDefaultController<Uint8Array>;
      const stream = new ReadableStream({
        start: async (controller) => {
          streamController = controller;
          // Read historical messages from durable storage
          const messages =
            (await this.ctx.storage.get<StreamMessage[]>("messages")) || [];

          // Send all historical messages
          for (const message of messages) {
            const encoded = new TextEncoder().encode(
              JSON.stringify(message) + "\n",
            );
            controller.enqueue(encoded);
          }

          // Add to active controllers for future messages
          this.controllers.push(controller);
        },
        cancel: () => {
          // Remove from active controllers when client disconnects
          const index = this.controllers.indexOf(streamController);
          if (index > -1) {
            this.controllers.splice(index, 1);
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "application/x-ndjson",
          "Cache-Control": "no-cache",
        },
      });
    }

    return new Response("Not found", { status: 404 });
  }
}

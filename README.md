# Cloudflare Durable Objects + Workflows Prototype

Prototype of connecting [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/) to [Cloudflare Workflows](https://developers.cloudflare.com/workflows/) to give each workflow a persistent writable stream, similar to [Vercel Workflow](https://useworkflow.dev/docs/foundations/streaming).

## How to run

```bash
pnpm install
pnpm dev
```

Open http://localhost:8787 in your browser, select a workflow, and click "Start Workflow".

## How it works

Workflows are defined as async functions that can request user input (`relay.input()`) and write messages (`relay.output()`). Under the hood, a wrapper around the `WorkflowEntrypoint` class handles all the message-passing logic + wrapping `step.do()` and `step.waitForEvent()`, allowing workflows to pause for input and resume when received using a nice API.

The key is giving each workflow a unique Durable Object that acts as a persistent message buffer. Messages are stored durably and streamed to connected clients in real-time via SSE. This enables bi-directional communication where workflows can incrementally write updates and wait for user responses, all while maintaining a persistent stream that can be resumed even after page reloads.

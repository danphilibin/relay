# Cloudflare Durable Objects + Workflows Prototype

Prototype of connecting [Cloudflare Durable Objects](https://developers.cloudflare.com/durable-objects/) to [Cloudflare Workflows](https://developers.cloudflare.com/workflows/) to give each workflow a persistent readable stream, similar to [Vercel Workflow](https://useworkflow.dev/docs/foundations/streaming).

## How to run

```bash
pnpm install
pnpm dev
```

Open http://localhost:8787 in your browser, select a workflow, and click "Start Workflow" to see the stream in action.

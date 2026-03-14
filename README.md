# Relay

Relay is an internal tools framework concept that pairs [Cloudflare Workflows](https://developers.cloudflare.com/workflows/) with [Durable Objects](https://developers.cloudflare.com/durable-objects/) to enable durable, interactive backend functions that pause for input, show progress, and stream UI instructions to browsers and agents.

_A spiritual successor to [Interval](https://docs.intervalkit.com/)_

## Local development

```bash
pnpm install
pnpm dev
```

This starts two servers concurrently:

- **Worker** on `http://localhost:8787` — the Cloudflare Workers API
- **Vite** on `http://localhost:5173` — the React frontend (proxies API requests to the worker)

Open http://localhost:5173 and select a workflow in the sidebar.

## Deploy to Cloudflare

Relay consists of two apps: a static frontend UI deployed to [Cloudflare Pages](https://developers.cloudflare.com/pages/) that hosts your UI, and a backend app that deploys to [Cloudflare Workers](https://developers.cloudflare.com/workers/) that hosts your tools.

### 1. Deploy the worker

```bash
pnpm --filter relay-examples run deploy
```

On first deploy, Wrangler will create a Workers project called `relay-tools`. Note the URL it prints (e.g. `https://relay-tools.your-subdomain.workers.dev`).

### 2. Deploy the frontend

```bash
pnpm --filter relay-web run deploy
```

On first deploy, Wrangler will create a Pages project called `relay-web`. Note the URL it prints (e.g. `https://relay-web.pages.dev`).

### 3. Configure the frontend

Create `packages/web/.env.production` with your worker URL:

```
VITE_RELAY_WORKER_URL=https://relay-tools.your-subdomain.workers.dev
```

Vite loads this file automatically during production builds, so the URL gets baked in when you run `deploy`.

### 4. Set the app URL on the worker

This lets the worker include browser links in MCP responses so agents can link to in-progress runs:

```bash
npx wrangler --config apps/examples/wrangler.jsonc secret put RELAY_APP_URL
```

When prompted, enter your frontend URL (e.g. `https://relay-web.pages.dev`).

### Deploy both at once

Once you've deployed each app at least once and configured the Pages environment variable, you can redeploy everything with:

```bash
pnpm build && pnpm deploy:all
```

## MCP

Every workflow you define with `createWorkflow()` is automatically exposed as an [MCP](https://modelcontextprotocol.io/) tool. Agents can start workflows, respond to input requests, and receive structured output — all through the MCP protocol.

Relay supports two MCP transports:

- **Remote (Streamable HTTP)** — served at the `/mcp` endpoint of your deployed worker (e.g. `https://relay-tools.your-subdomain.workers.dev/mcp`)
- **Local (stdio)** — a lightweight Node.js process that proxies tool calls to the Relay API

### Connecting from Claude Desktop / Claude Web

Add your deployed worker's MCP endpoint as a remote MCP server:

```
https://relay-tools.your-subdomain.workers.dev/mcp
```

In Claude Web or Claude Desktop, go to Settings → MCP Servers → Add → enter the URL above.

### Connecting from Claude Code

```bash
claude mcp add relay-tools https://relay-tools.your-subdomain.workers.dev/mcp
```

For local development, use the stdio transport instead:

```bash
claude mcp add relay-tools -- npx tsx mcp/server.ts
```

This starts a local MCP server that connects to `http://localhost:8787` by default. To point it at a deployed worker, set the `RELAY_WORKER_URL` environment variable:

```bash
claude mcp add relay-tools -e RELAY_WORKER_URL=https://relay-tools.your-subdomain.workers.dev -- npx tsx mcp/server.ts
```

## How it works

Workflows are defined with `createWorkflow()`. The handler receives a context with `input()`, `output()`, `loading()`, and `confirm()` helpers:

```ts
import { createWorkflow } from "relay-sdk";

createWorkflow({
  name: "Newsletter Signup",
  handler: async ({ input, output, loading }) => {
    const name = await input.text("What is your name?");

    const { email, subscribe } = await input.group("More info", {
      email: input.text("Email"),
      subscribe: input.checkbox("Subscribe?"),
    });

    await loading("Processing...", async ({ complete }) => {
      // do async work
      complete("Done!");
    });

    await output.markdown(`Thanks ${name}!`);
  },
});
```

Field builders are awaitable on their own and composable in groups. For
upfront workflow input, use `field.*` in `createWorkflow({ input })`. Relay
still compiles those builders down to the same schema-driven protocol sent to
the browser, so the frontend remains workflow-agnostic.

Each workflow instance gets a Durable Object (keyed by instance ID) that supplies a persistent message buffer. The `RelayWorkflow` entrypoint wraps `step.do()` and `step.waitForEvent()` under the hood — `input()` sends an input request message, then waits for an event with the user's response. Messages are durably stored and streamed to clients via NDJSON, so the stream survives page reloads.

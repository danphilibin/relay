# Relay

Relay is an internal tools framework concept that pairs [Cloudflare Workflows](https://developers.cloudflare.com/workflows/) with [Durable Objects](https://developers.cloudflare.com/durable-objects/) to enable durable, interactive backend functions that pause for input, show progress, and stream UI instructions to browsers and agents.

_A spiritual successor to [Interval](https://docs.intervalkit.com/)_

**Live demo: [relay-demo.philib.in](https://relay-demo.philib.in)** — run the example workflows in your browser, or connect an agent to them over MCP.

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

Relay consists of two apps, both deployed to [Cloudflare Workers](https://developers.cloudflare.com/workers/):

- **Worker** (`apps/examples`, deployed as `relay-tools`): hosts your tools. It runs workflows and serves the MCP endpoint.
- **Web app** (`packages/web`, deployed as `relay-web`): hosts the UI. It's a server-rendered TanStack Start app that forwards API and MCP requests to the worker server-side, so the worker URL is never exposed to browsers.

### Deploy both at once

```bash
pnpm build && pnpm deploy:all
```

`scripts/deploy.sh` deploys the worker, saves its URL on the web app as `RELAY_WORKER_URL`, deploys the web app, and then sets `RELAY_APP_URL` on the worker so agents get links to in-progress runs. `RELAY_APP_URL` defaults to the demo's public address; point it elsewhere with `APP_URL=https://your-app.example.com pnpm deploy:all`.

On a branch other than `main`, the worker is deployed as `relay-tools-<branch>`. The web app is always `relay-web`, so a branch deploy points the one web app at the branch's worker.

### Deploy each app manually

1. **Deploy the worker.** Wrangler prints its URL (e.g. `https://relay-tools.your-subdomain.workers.dev`).

   ```bash
   pnpm --filter relay-examples run deploy
   ```

2. **Deploy the web app.** Wrangler prints its URL (e.g. `https://relay-web.your-subdomain.workers.dev`).

   ```bash
   pnpm --filter @relay-tools/web run deploy
   ```

3. **Tell the web app where the worker is.** It forwards requests to this URL at runtime; nothing is baked into the build.

   ```bash
   npx wrangler --config packages/web/wrangler.jsonc secret put RELAY_WORKER_URL
   # paste: https://relay-tools.your-subdomain.workers.dev
   ```

   For local development, this is set in `packages/web/.dev.vars`.

4. **Tell the worker where the web app is,** so MCP responses can link to in-progress runs:

   ```bash
   npx wrangler --config apps/examples/wrangler.jsonc secret put RELAY_APP_URL
   # paste: your web app URL (its custom domain, if it has one)
   ```

### Custom domain (optional)

To serve the web app from your own domain, the domain's DNS must be on Cloudflare. Then go to Workers & Pages → `relay-web` → Settings → Domains & Routes → Add → Custom domain. Update `RELAY_APP_URL` on the worker to match (step 4 above, or `APP_URL` for `deploy:all`).

## MCP

Workflows that opt in with `mcp: true` in `createWorkflow()` are exposed as [MCP](https://modelcontextprotocol.io/) tools, plus a `relay_respond` tool for answering input requests. Agents can start workflows, respond to input requests, and receive structured output — all through the MCP protocol.

Relay supports two MCP transports:

- **Remote (Streamable HTTP)** — served at `/mcp` on the web app (e.g. `https://relay-web.your-subdomain.workers.dev/mcp`). The web app's home page shows this URL with setup instructions. It's only available when the web app has no login configured (no `WORKOS_CLIENT_ID`); the worker also serves `/mcp` directly, but that requires a Bearer token whenever worker auth is on.
- **Local (stdio)** — a lightweight Node.js process that proxies tool calls to the Relay API

### Connecting from Claude Desktop / claude.ai

In Settings → Connectors → Add custom connector, enter the web app's MCP URL:

```
https://relay-web.your-subdomain.workers.dev/mcp
```

### Connecting from Claude Code

```bash
claude mcp add --transport http relay https://relay-web.your-subdomain.workers.dev/mcp
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
import { createWorkflow } from "@relay-tools/sdk";

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

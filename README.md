# Relay

Prototype. Pairs [Cloudflare Workflows](https://developers.cloudflare.com/workflows/) with [Durable Objects](https://developers.cloudflare.com/durable-objects/) to enable interactive backend functions that pause for user input, show progress, and stream UI instructions to the browser.

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

Both apps deploy independently — the worker to [Cloudflare Workers](https://developers.cloudflare.com/workers/) and the frontend to [Cloudflare Pages](https://developers.cloudflare.com/pages/).

### 1. Deploy the worker

```bash
pnpm --filter relay-examples deploy
```

On first deploy, Wrangler will create a Workers project called `relay-tools`. Note the URL it prints (e.g. `https://relay-tools.your-subdomain.workers.dev`).

### 2. Configure the frontend

Create a `.env` file in `packages/web/` with your worker URL:

```bash
cp packages/web/.env.example packages/web/.env
```

Edit `packages/web/.env` and replace `YOUR-SUBDOMAIN` with your Cloudflare subdomain:

```
VITE_RELAY_WORKER_URL=https://relay-tools.your-subdomain.workers.dev
```

### 3. Build and deploy the frontend

```bash
pnpm --filter relay-web build
pnpm --filter relay-web deploy
```

On first deploy, Wrangler will create a Pages project called `relay-web`.

### Deploy both at once

Once you've deployed each app at least once and configured `packages/web/.env`, you can redeploy everything with:

```bash
pnpm build
pnpm deploy
```

## How it works

Workflows are defined with `createWorkflow()`. The handler receives a context with `input()`, `output()`, `loading()`, and `confirm()` helpers:

```ts
createWorkflow({
  name: "Newsletter Signup",
  handler: async ({ input, output, loading }) => {
    const name = await input("What is your name?");

    const { email, subscribe } = await input("More info", {
      email: { type: "text", label: "Email" },
      subscribe: { type: "checkbox", label: "Subscribe?" },
    });

    await loading("Processing...", async ({ complete }) => {
      // do async work
      complete("Done!");
    });

    await output.markdown(`Thanks ${name}!`);
  },
});
```

Each workflow instance gets a Durable Object (keyed by instance ID) that supplies a persistent message buffer. The `RelayWorkflow` entrypoint wraps `step.do()` and `step.waitForEvent()` under the hood — `input()` sends an input request message, then waits for an event with the user's response. Messages are durably stored and streamed to clients via NDJSON, so the stream survives page reloads.

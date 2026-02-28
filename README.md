# Relay

Prototype. Pairs [Cloudflare Workflows](https://developers.cloudflare.com/workflows/) with [Durable Objects](https://developers.cloudflare.com/durable-objects/) to enable interactive backend functions that pause for user input, show progress, and stream UI instructions to the browser.

_A spiritual successor to [Interval](https://docs.intervalkit.com/)_

## How to run

```bash
pnpm install
pnpm dev
```

Open http://localhost:8787 in your browser, select a workflow, and click "Start Workflow".

## Frontend API configuration

The React app can target any API host at runtime/build-time:

- Runtime override: set `window.RELAY_API_URL` before the app boots.
- Build-time fallback: set `VITE_API_URL` when running `pnpm dev`/`pnpm build`.
- If neither is set, the app uses relative paths (works with the current Vite proxy in local dev).

Example build against another backend:

```bash
VITE_API_URL=http://localhost:8787 pnpm build
```

## How it works

Workflows are defined with `createWorkflow(name, handler)`. The handler receives a context with `input()`, `output()`, and `loading()` helpers:

```ts
createWorkflow("newsletter-signup", async ({ input, output, loading }) => {
  const name = await input("What is your name?");

  const { email, subscribe } = await input("More info", {
    email: { type: "text", label: "Email" },
    subscribe: { type: "checkbox", label: "Subscribe?" },
  });

  await loading("Processing...", async ({ complete }) => {
    // do async work
    complete("Done!");
  });

  await output(`Thanks ${name}!`);
});
```

Each workflow instance gets a Durable Object (keyed by instance ID) that supplies a persistent message buffer. The `RelayWorkflow` entrypoint wraps `step.do()` and `step.waitForEvent()` under the hood—`input()` sends an input request message, then waits for an event with the user's response. Messages are durably stored and streamed to clients via NDJSON, so the stream survives page reloads.

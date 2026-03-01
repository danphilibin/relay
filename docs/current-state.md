# Current state of the prototype

Last updated: 2026-02-28

---

## What this is

A working prototype of a workflow engine that pairs **Cloudflare Workflows** (durable, step-based execution) with **Cloudflare Durable Objects** (persistent per-run stream). Workflows are defined in backend code using a small SDK. The SDK provides primitives (`input`, `output`, `loading`, `confirm`) that send JSON messages over an NDJSON stream to a React client, which renders structured UIs (forms, loading spinners, confirmation dialogs, rich content) without any frontend code per workflow. No polling, no long-running requests — just a persistent readable stream per workflow run.

There is also a **call-response API** for agents (MCP, CLI, etc.) that starts workflows and submits responses synchronously, blocking until the next interaction point.

---

## Project structure

The repo is a **pnpm workspace** with two packages and one example app:

```
workflows-starter/
├── packages/
│   ├── sdk/              → relay-sdk (Cloudflare Relay SDK)
│   │   └── src/
│   │       ├── isomorphic/   # Shared types/logic (no cloudflare:workers imports)
│   │       │   └── __tests__/ # Unit tests for isomorphic code
│   │       └── sdk/          # Cloudflare-specific SDK implementation
│   └── web/              → relay-web (React SPA, independently deployable)
│       ├── app/
│       │   ├── components/workflow/
│       │   │   └── fields/   # Individual form field components
│       │   ├── hooks/
│       │   ├── lib/
│       │   └── routes/
│       ├── vite.config.ts
│       └── react-router.config.ts
├── apps/
│   └── examples/         → Example Cloudflare Worker
│       ├── src/
│       │   ├── index.ts      # Worker entrypoint (re-exports CF classes)
│       │   └── workflows/    # Example workflow definitions
│       └── wrangler.jsonc
├── mcp/                  # MCP server entrypoint (thin wrapper over relay-sdk/mcp)
├── tests/                # End-to-end tests (Playwright)
├── pnpm-workspace.yaml
├── conductor.json
└── package.json          # Workspace scripts only — no deployable code
```

---

## Tech stack

- **pnpm workspaces** — monorepo management
- **Cloudflare Workers** — runtime
- **Cloudflare Workflows** — durable step-based execution (replay-safe)
- **Cloudflare Durable Objects** — per-run message persistence + streaming
- **React 19** + **React Router v7** — SPA mode, no SSR
- **Tailwind CSS v4** — styling
- **@cloudflare/kumo** — Cloudflare's component library (Button, Input, Checkbox, Select, Loader)
- **Zod v4** — schema validation for stream messages
- **Vite** — dev server + build
- **TypeScript** — throughout

---

## Package boundaries

### `packages/sdk` → `relay-sdk`

Everything needed to build a Relay-powered Cloudflare Worker.

**Main export (`relay-sdk`):** Server-side — `createWorkflow`, `RelayWorkflow`, `RelayDurableObject`, `RelayMcpAgent`, `httpHandler`, registry functions, all isomorphic types.

**Client export (`relay-sdk/client`):** Browser-safe — message types, schemas, `parseStreamMessage`, `formatCallResponseForMcp`, registry types. No `cloudflare:workers` dependency.

**MCP export (`relay-sdk/mcp`):** Node.js — `createRelayMcpServer` factory that builds an MCP server exposing all workflows as tools. Handles workflow discovery, InputSchema-to-Zod conversion, and the `relay_respond` tool. Depends on `@modelcontextprotocol/sdk`.

#### `src/isomorphic/`

Code shared between server and client — no `cloudflare:workers` imports. Contains:

- **`messages.ts`** — `StreamMessage` discriminated union + Zod schemas + factory functions + `CallResponseResult` type
- **`input.ts`** — `InputSchema` field types + type inference utilities
- **`output.ts`** — `OutputBlock` types (markdown, table, code, image, link, buttons)
- **`registry-types.ts`** — Workflow registry types safe for client import
- **`mcp-translation.ts`** — Formats `CallResponseResult` as human-readable text for MCP agents

#### `src/sdk/`

Cloudflare-specific SDK. Contains:

- **`cf-workflow.ts`** — `RelayWorkflow` class (`WorkflowEntrypoint`) + `createWorkflow()` factory + `RelayContext` type
- **`cf-durable-object.ts`** — `RelayDurableObject` class — stores and streams messages per run
- **`cf-http.ts`** — HTTP request handler with all routes
- **`cf-mcp-agent.ts`** — `RelayMcpAgent` class — Cloudflare-native MCP server (Durable Object) using `agents` SDK, serves at `/mcp` via Streamable HTTP transport
- **`workflow-api.ts`** — Core workflow execution functions (`startWorkflowRun`, `respondToWorkflowRun`, `consumeUntilInteraction`) shared between HTTP handler and McpAgent
- **`registry.ts`** — Workflow registry (global Map, populated by `createWorkflow()`)
- **`mcp.ts`** — `createRelayMcpServer` factory — builds an MCP server from the Relay API (stdio transport, for standalone Node.js process)
- **`client.ts`** — Re-exports only isomorphic types (for client import)
- **`index.ts`** — Full SDK exports (server-side)
- **`env.d.ts`** — `Env` interface declaring expected Cloudflare bindings

### `packages/web` → `relay-web`

The React frontend SPA. Independently deployable to Cloudflare Pages (or equivalent). Configured with a runtime API URL — no hardcoded host.

Dependencies: `relay-sdk` (via `relay-sdk/client` for shared message/input/output types).

### `apps/examples` → `relay-examples`

The example Cloudflare Worker. Demonstrates the real-life deployment shape: a user's worker app that imports from `relay-sdk`, defines workflows, and deploys independently from `relay-web`.

Seven example workflows: ask-name, approval-test, fetch-hacker-news, newsletter-signup, rich-output-demo, refund, survey.

Dependencies: `relay-sdk`.

### Root

Workspace config and scripts only. No deployable code. Contains a thin MCP server entrypoint (`mcp/`) that delegates to `relay-sdk/mcp`, e2e tests (`tests/`), and shared dev tooling config.

---

## How workflows are defined

Workflows are defined with `createWorkflow()` which self-registers into a global `Map`. Two forms:

```ts
// With upfront input schema — data is collected before the handler runs
createWorkflow({
  name: "Newsletter Signup",
  description: "...",
  input: {
    name: { type: "text", label: "Full name" },
    email: { type: "text", label: "Email address" },
    subscribe: { type: "checkbox", label: "Subscribe to updates" },
  },
  handler: async ({ data, output, loading }) => {
    // data is typed: { name: string; email: string; subscribe: boolean }
    await output.markdown(`Thanks, ${data.name}!`);
  },
});

// Without upfront input — input collected inline during execution
createWorkflow({
  name: "Ask Name",
  handler: async ({ input, output }) => {
    await output.markdown("Hello! What is your name?");
    const name = await input("Enter your name");
    await output.markdown(`Nice to meet you, ${name}!`);
  },
});
```

### Handler context (`RelayContext`)

| Property                                     | Type / Signature                                             | What it does                                            |
| -------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------- |
| `output.markdown(content)`                   | `(content: string) => Promise<void>`                         | Sends a markdown block to the stream                    |
| `output.table({ title?, data })`             | `=> Promise<void>`                                           | Sends a data table                                      |
| `output.code({ code, language? })`           | `=> Promise<void>`                                           | Sends a code block                                      |
| `output.image({ src, alt? })`                | `=> Promise<void>`                                           | Sends an image                                          |
| `output.link({ url, title?, description? })` | `=> Promise<void>`                                           | Sends a link card                                       |
| `output.buttons(buttons)`                    | `=> Promise<void>`                                           | Sends action buttons                                    |
| `input(prompt)`                              | `(prompt: string) => Promise<string>`                        | Shows a text input, waits for response                  |
| `input(prompt, schema)`                      | `=> Promise<InferInputResult<T>>`                            | Shows a multi-field form, waits                         |
| `input(prompt, { buttons })`                 | `=> Promise<{ value, $choice }>`                             | Text input with custom buttons                          |
| `input(prompt, schema, { buttons })`         | `=> Promise<InferInputResult<T> & { $choice }>`              | Form with custom buttons                                |
| `loading(msg, callback)`                     | `(msg: string, cb: (ctx) => Promise<void>) => Promise<void>` | Shows spinner during async work                         |
| `confirm(msg)`                               | `(msg: string) => Promise<boolean>`                          | Approve/reject dialog                                   |
| `step`                                       | `WorkflowStep`                                               | Raw Cloudflare step (`step.do()`, `step.sleep()`, etc.) |
| `data`                                       | `InferInputResult<T>`                                        | Typed upfront input (only when input schema provided)   |

### InputSchema field types

```ts
type TextFieldDef = {
  type: "text";
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
};
type NumberFieldDef = {
  type: "number";
  label: string;
  description?: string;
  placeholder?: string;
  required?: boolean;
};
type CheckboxFieldDef = {
  type: "checkbox";
  label: string;
  description?: string;
  required?: boolean;
};
type SelectFieldDef = {
  type: "select";
  label: string;
  description?: string;
  options: { value: string; label: string }[];
  required?: boolean;
};
```

Type inference: text → string, number → number, checkbox → boolean, select → string.

---

## How the server works

### Classes exported from `relay-sdk`

1. **`RelayWorkflow`** (`WorkflowEntrypoint`) — the Cloudflare Workflow class. On `run()`, looks up the workflow by name from the registry, gets a Durable Object stub by instance ID, and executes the handler. All SDK primitives (`output`, `input`, `loading`, `confirm`) call `step.do()` to send messages to the DO, making them replay-safe.

2. **`RelayDurableObject`** (`DurableObject`) — one per workflow run, identified by instance ID. Stores messages as a `StreamMessage[]` array in Durable storage. Exposes:
   - `POST /stream` — appends a message, broadcasts to all open connections
   - `GET /stream` — returns an NDJSON `ReadableStream` that replays all historical messages then keeps the connection open for live updates

3. **`RelayMcpAgent`** (`McpAgent` from `agents/mcp`) — a Durable Object that serves as a Cloudflare-native MCP server. On `init()`, registers one tool per workflow (using the same `startWorkflowRun`/`respondToWorkflowRun` functions as the HTTP handler) plus a `relay_respond` tool. Served via `RelayMcpAgent.serve("/mcp")` which handles Streamable HTTP transport. Remote MCP clients (e.g. Claude web) can connect to `/mcp`.

4. **`httpHandler`** — the Worker fetch handler. Routes:

#### Interactive API (browser clients)

| Method | Path                         | Action                                                  |
| ------ | ---------------------------- | ------------------------------------------------------- |
| `GET`  | `/workflows`                 | Returns workflow metadata list from registry            |
| `POST` | `/workflows`                 | Creates a new workflow instance, returns `{ id, name }` |
| `GET`  | `/workflows/:id/stream`      | Proxies to the DO's NDJSON stream                       |
| `POST` | `/workflows/:id/event/:name` | Submits user response (input value or confirm decision) |

#### Call-response API (agents)

| Method | Path                   | Action                                                                                |
| ------ | ---------------------- | ------------------------------------------------------------------------------------- |
| `POST` | `/api/run`             | Starts a workflow, blocks until first interaction point, returns `CallResponseResult` |
| `POST` | `/api/run/:id/respond` | Submits a response, blocks until next interaction point, returns `CallResponseResult` |

`CallResponseResult` shape:

```ts
{
  run_id: string;
  status: "awaiting_input" | "awaiting_confirm" | "complete";
  messages: StreamMessage[];      // all messages since last interaction
  interaction: InputRequestMessage | ConfirmRequestMessage | null;
}
```

### How `input()` suspends and resumes

1. `step.do(requestEvent)` → sends `input_request` message to DO stream (idempotent on replay)
2. `step.waitForEvent(eventName)` → suspends the Workflow (5-minute timeout)
3. Client submits form → `POST /workflows/:id/event/:name` → handler sends `input_received` to DO + calls `instance.sendEvent()` to resume
4. Workflow continues with the submitted payload

### How upfront input works

If a workflow has an `input` schema and no `data` was pre-supplied in the event payload, the system automatically sends an `input_request` with the full schema before calling the handler. If `data` was pre-filled (e.g. by an agent passing it to `/api/run`), the form step is skipped.

---

## How the client works

### Routing

- `/` — home (placeholder)
- `/:workflowName` — starts a new run of the named workflow
- `/:workflowName/:runId` — connects to an existing run

### `useWorkflowStream` hook

The core hook. State machine: `idle → connecting → streaming → complete | error`.

1. If no `runId`, POSTs `/workflows` to create a new instance, navigates to `/:name/:id`
2. Opens `GET /workflows/:id/stream` with fetch + `getReader()`
3. Decodes NDJSON line-by-line (handles partial chunks via buffer)
4. Parses each line with Zod (`parseStreamMessage`)
5. `loading` messages update in-place by ID (spinner → checkmark); all others append
6. Stream close (`done: true`) → status becomes `"complete"`
7. `AbortController` cancels fetch on navigation

Exposes: `status`, `messages`, `currentRunId`, `startNewRun()`, `submitInput(eventName, value)`, `submitConfirm(eventName, approved)`.

### Message rendering

`MessageList` pairs request/response messages at render time — `input_request` is paired with its subsequent `input_received` (and likewise for confirms). The submitted value is passed to the form component so it renders in a disabled/answered state.

- `output` → `<OutputMessage>` — renders the appropriate block type (markdown, table, code, image, link, buttons)
- `input_request` → `<InputRequestMessage>` — dynamic form built from InputSchema, with custom buttons
- `confirm_request` → `<ConfirmRequestMessage>` — approve/reject dialog (amber → green/red on answer)
- `loading` → `<LoadingMessage>` — spinner while `complete: false`, green check when `complete: true`
- `input_received`, `confirm_received`, `workflow_complete` — consumed by pairing logic, not rendered directly

---

## Stream message types

Zod-validated discriminated union on `type`:

```ts
{ id, type: "output",           block: OutputBlock }
{ id, type: "input_request",    prompt: string, schema: InputSchema, buttons: NormalizedButton[] }
{ id, type: "input_received",   value: Record<string, unknown> }
{ id, type: "loading",          text: string, complete: boolean }
{ id, type: "confirm_request",  message: string }
{ id, type: "confirm_received", approved: boolean }
{ id, type: "workflow_complete" }
```

`OutputBlock` is a discriminated union on `type`: `output.markdown`, `output.table`, `output.code`, `output.image`, `output.link`, `output.buttons`.

Buttons: `{ label: string; url?: string; intent?: "primary" | "secondary" | "danger" }`. Default when none specified: `[{ label: "Continue", intent: "primary" }]`.

---

## Dev setup

```bash
pnpm dev   # Runs wrangler (port 8787) + Vite (port 5173) concurrently
```

Vite proxies `/workflows` and `/api` to `localhost:8787`. React Router runs in SPA mode (no SSR). The web app imports shared types via `relay-sdk/client` (no `cloudflare:workers` dependency).

API base URL is configurable via `window.RELAY_WORKER_URL` or `VITE_RELAY_WORKER_URL` env var (handled in `packages/web/app/lib/api.ts`).

---

## What's working

- Full create → stream → interact → complete lifecycle
- All SDK primitives: `output` (6 rich block types), `input` (all overloads), `loading`, `confirm`
- Upfront input schemas with typed data
- Custom buttons with intent styling
- Message persistence in Durable Objects (page reload reconnects to full history)
- Multiple concurrent stream connections
- Seven example workflows covering simple to complex cases
- Dynamic form rendering from InputSchema (text, number, checkbox, select)
- Request/response pairing in the UI
- Loading state transitions (spinner → checkmark)
- Call-response API for agent/MCP use
- MCP server exposing all workflows as tools

---

## What's not built yet

- Authentication / access control
- Audit logging
- Webhook / cron triggers
- Dashboard / workflow listing with run history
- Error handling UI (workflow failures, timeouts)

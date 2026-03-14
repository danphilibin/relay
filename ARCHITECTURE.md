# Architecture

This document describes the high-level architecture of Relay, a workflow engine that pairs Cloudflare Workflows with Cloudflare Durable Objects to let developers define interactive, multi-step workflows in backend code and have them rendered automatically in a React frontend. If you want to familiarize yourself with the codebase, this is a good place to start.

## Bird's Eye View

A workflow author writes a handler using a small SDK (`createWorkflow`). The SDK provides primitives — `input`, `output`, `loading`, `confirm` — that each become a durable step in a Cloudflare Workflow. Each step sends a JSON message to a per-run Durable Object, which persists the message and broadcasts it over an NDJSON stream. A React SPA connects to that stream and renders structured UI (forms, spinners, confirmation dialogs, rich content) without any per-workflow frontend code.

There is also a synchronous call-response API for agents (MCP, CLI) that blocks until the next interaction point, so non-browser clients can drive workflows too.

## Codemap

The repo is a pnpm monorepo with two packages and one example app.

```
workflows-starter/
├── packages/
│   ├── sdk/              → Core SDK
│   │   └── src/
│   │       ├── isomorphic/   # Shared types/logic (no cloudflare:workers imports)
│   │       └── sdk/          # Cloudflare-specific implementation
│   └── web/              → React SPA (independently deployable)
│       └── app/
│           ├── components/workflow/
│           ├── hooks/
│           ├── lib/
│           └── routes/
├── apps/
│   ├── examples/         → Example Cloudflare Worker
│   │   └── src/
│   │       ├── index.ts      # Worker entrypoint
│   │       └── workflows/    # Example workflow definitions
│   └── e2e-tests/        → E2e test suite (workflows + Playwright specs)
│       ├── src/
│       │   ├── index.ts      # Worker entrypoint
│       │   └── workflows/    # One workflow per SDK primitive
│       └── specs/            # Playwright specs organized by primitive
├── mcp/                  # MCP server entrypoint (stdio transport)
├── tests/
│   └── e2e/              # Playwright end-to-end tests
└── package.json          # Workspace scripts only — no deployable code
```

### `packages/sdk`

The core SDK. Everything needed to build a Relay-powered Cloudflare Worker.

Three entry points:

- **`relay-sdk`** — Server-side. `createWorkflow`, `RelayWorkflow`, `RelayDurableObject`, `RelayMcpAgent`, `httpHandler`, registry functions.
- **`relay-sdk/client`** — Browser-safe. Message types, schemas, `parseStreamMessage`. No `cloudflare:workers` dependency.
- **`relay-sdk/mcp`** — Node.js. `createRelayMcpServer` factory for stdio-based MCP servers.

Internally split into two directories:

- **`src/isomorphic/`** — Shared types and logic with no Cloudflare runtime dependency. Message schemas (`messages.ts`), input field types (`input.ts`), output block types (`output.ts`), registry types, MCP text formatting.
- **`src/sdk/`** — Cloudflare-specific implementation. The key files:
  - `cf-workflow.ts` — `RelayWorkflow` class (`WorkflowEntrypoint`) and `createWorkflow()` factory
  - `cf-durable-object.ts` — `RelayDurableObject`, stores and streams messages per run
  - `cf-http.ts` — HTTP request handler with all routes
  - `cf-mcp-agent.ts` — `RelayMcpAgent`, Cloudflare-native MCP server (Durable Object)
  - `workflow-api.ts` — Core execution functions shared between the HTTP handler and MCP agent
  - `registry.ts` — Global workflow registry (`Map`), populated by `createWorkflow()`

### `packages/web`

React SPA (React 19, React Router v7, Tailwind v4). Independently deployable. Connects to a Relay worker via a configurable API URL.

The core hook is `useWorkflowStream` — it manages the full lifecycle of connecting to a run's NDJSON stream, parsing messages with Zod, and exposing state to the UI. Message rendering is driven by the `StreamMessage` discriminated union; the UI never needs to know what workflow it's displaying.

### `apps/examples`

Example Cloudflare Worker demonstrating the deployment shape: imports `relay-sdk`, defines workflows, deploys independently. Contains several example workflows covering simple to complex cases.

### `apps/e2e-tests`

E2e test suite — colocates the test Cloudflare Worker (workflows) and Playwright specs. One workflow per SDK primitive, designed for automated testing rather than demos. Runs on separate ports (worker:8788, web:5174) so it doesn't conflict with `pnpm dev`. See `apps/e2e-tests/README.md`.

### `mcp/`

Thin MCP server entrypoint that delegates to `relay-sdk/mcp`. Used for running a local MCP server over stdio.

## Ground Rules

- **`isomorphic/` has no Cloudflare runtime imports.** Everything in `src/isomorphic/` must be safe to import from both the Worker and the browser. The `relay-sdk/client` entry point re-exports only from this directory.
- **Workflows self-register.** `createWorkflow()` pushes into a global `Map`. There is no manual wiring step — importing a workflow file is sufficient.
- **Every SDK primitive is a `step.do()` call.** `output`, `input`, `loading`, and `confirm` all go through Cloudflare's `step.do()`, making them replay-safe and durable.
- **The frontend is workflow-agnostic.** The React app renders any workflow purely from the `StreamMessage` stream. There is no per-workflow UI code.
- **The Durable Object is the source of truth.** All messages are persisted in the DO. The stream replays full history on reconnect, so the client can recover from disconnects or page reloads.

## Cross-Cutting Concerns

**Message protocol:** The `StreamMessage` Zod-validated discriminated union (on `type`) is the contract between SDK, DO, HTTP layer, and frontend. All message types are defined once in `isomorphic/messages.ts`.

**Input schema / type inference:** `InputSchema` field definitions (`text`, `number`, `checkbox`, `select`) flow from workflow definition through the stream protocol to the frontend form renderer. TypeScript inference maps field types to result types (`text` -> `string`, `checkbox` -> `boolean`, etc.).

**Dual API surface:** Both the interactive API (browser: stream + events) and the call-response API (agents: blocking POST) share the same core execution functions in `workflow-api.ts`, avoiding divergence.

## SDK Primitives

The handler context (`RelayContext`) passed to every workflow:

| Property                                     | Signature                                       | What it does                                            |
| -------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| `output.markdown(content)`                   | `(string) => Promise<void>`                     | Sends a markdown block                                  |
| `output.table({ title?, data })`             | `=> Promise<void>`                              | Sends a data table                                      |
| `output.code({ code, language? })`           | `=> Promise<void>`                              | Sends a code block                                      |
| `output.image({ src, alt? })`                | `=> Promise<void>`                              | Sends an image                                          |
| `output.link({ url, title?, description? })` | `=> Promise<void>`                              | Sends a link card                                       |
| `output.buttons(buttons)`                    | `=> Promise<void>`                              | Sends action buttons                                    |
| `input(prompt)`                              | `(string) => Promise<string>`                   | Text input, waits for response                          |
| `input(prompt, schema)`                      | `=> Promise<InferInputResult<T>>`               | Multi-field form, waits                                 |
| `input(prompt, { buttons })`                 | `=> Promise<{ value, $choice }>`                | Text input with custom buttons                          |
| `input(prompt, schema, { buttons })`         | `=> Promise<InferInputResult<T> & { $choice }>` | Form with custom buttons                                |
| `loading(msg, callback)`                     | `(string, cb) => Promise<void>`                 | Shows spinner during async work                         |
| `confirm(msg)`                               | `(string) => Promise<boolean>`                  | Approve/reject dialog                                   |
| `step`                                       | `WorkflowStep`                                  | Raw Cloudflare step (`step.do()`, `step.sleep()`, etc.) |
| `data`                                       | `InferInputResult<T>`                           | Typed upfront input (only when input schema provided)   |

## HTTP API

### Interactive API (browser clients)

| Method | Path                         | Action                                                  |
| ------ | ---------------------------- | ------------------------------------------------------- |
| `GET`  | `/workflows`                 | Returns workflow metadata list from registry            |
| `POST` | `/workflows`                 | Creates a new workflow instance, returns `{ id, name }` |
| `GET`  | `/workflows/:id/stream`      | Proxies to the DO's NDJSON stream                       |
| `POST` | `/workflows/:id/event/:name` | Submits user response (input value or confirm decision) |

### Call-response API (agents)

| Method | Path                   | Action                                                  |
| ------ | ---------------------- | ------------------------------------------------------- |
| `POST` | `/api/run`             | Starts a workflow, blocks until first interaction point |
| `POST` | `/api/run/:id/respond` | Submits a response, blocks until next interaction point |

Both return a `CallResponseResult`:

```ts
{
  run_id: string;
  status: "awaiting_input" | "awaiting_confirm" | "complete";
  messages: StreamMessage[];      // all messages since last interaction
  interaction: InputRequestMessage | ConfirmRequestMessage | null;
}
```

## How `input()` suspends and resumes

1. `step.do(requestEvent)` → sends `input_request` message to DO stream
2. `step.waitForEvent(eventName)` → suspends the Workflow
3. Client submits form → `POST /workflows/:id/event/:name` → sends `input_received` to DO + calls `instance.sendEvent()` to resume
4. Workflow continues with the submitted payload

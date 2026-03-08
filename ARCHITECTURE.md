# Architecture

This document describes the high-level architecture of Relay, a workflow engine that runs on Cloudflare Durable Objects and lets developers define interactive, multi-step workflows in backend code and have them rendered automatically in a React frontend. If you want to familiarize yourself with the codebase, this is a good place to start.

## Bird's Eye View

A workflow author writes a handler using a small SDK (`createWorkflow`). The SDK provides primitives — `input`, `output`, `loading`, `confirm` — that each become a durable step inside a `RelayExecutor` Durable Object. Each step persists its result and appends a JSON message to the run's message log, which is broadcast over an NDJSON stream. A React SPA connects to that stream and renders structured UI (forms, spinners, confirmation dialogs, rich content) without any per-workflow frontend code.

There is also a synchronous call-response API for agents (MCP, CLI) that blocks until the next interaction point, so non-browser clients can drive workflows too.

### Execution model

The executor uses a **replay-based** execution model. The workflow handler is a normal async function that runs from the beginning on every event. Previously completed `step.do()` calls return their cached result from DO storage; previously received events satisfy `waitForEvent()` immediately. When the handler reaches a `waitForEvent` for an event that hasn't arrived yet, it throws `SuspendExecution` to park the workflow. On the next event arrival, the handler replays from the top, skipping cached steps, until it either completes or suspends again.

This replaces an earlier Cloudflare Workflows-based implementation. Workflows had an unacceptable ~6 second scheduling delay in production. The DO-based executor wakes in <10ms via `fetch()`, giving near-instant interactive feedback.

**Constraint:** Because handlers replay from the top, they must be deterministic — the same steps must execute in the same order on every replay. Conditional steps (e.g., `if (condition) await input()`) will break the counter-based step naming and corrupt replay state.

## Codemap

The repo is a pnpm monorepo with two packages and one example app.

```
relay/
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

- **`relay-sdk`** — Server-side. `createWorkflow`, `RelayExecutor`, `RelayMcpAgent`, `httpHandler`, registry functions.
- **`relay-sdk/client`** — Browser-safe. Message types, schemas, `parseStreamMessage`. No `cloudflare:workers` dependency.
- **`relay-sdk/mcp`** — Node.js. `createRelayMcpServer` factory for stdio-based MCP servers.

Internally split into two directories:

- **`src/isomorphic/`** — Shared types and logic with no Cloudflare runtime dependency. Message schemas (`messages.ts`), input field types (`input.ts`), output block types (`output.ts`), registry types, MCP text formatting.
- **`src/sdk/`** — Cloudflare-specific implementation. The key files:
  - `cf-executor.ts` — `RelayExecutor` Durable Object, owns both workflow execution and message streaming per run
  - `cf-workflow.ts` — `createWorkflow()` factory and shared types (`RelayContext`, `RelayOutput`, etc.). Also contains the legacy `RelayWorkflow` class (Workflows entrypoint, no longer used)
  - `cf-http.ts` — HTTP request handler with all routes
  - `cf-mcp-agent.ts` — `RelayMcpAgent`, Cloudflare-native MCP server (Durable Object)
  - `workflow-api.ts` — Core call-response execution functions shared between the HTTP handler and MCP agent
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
- **Every SDK primitive is a durable step.** `output`, `input`, `loading`, and `confirm` all go through `step.do()`, making them replay-safe. Step results are persisted in DO storage as `step:{name}` keys.
- **The frontend is workflow-agnostic.** The React app renders any workflow purely from the `StreamMessage` stream. There is no per-workflow UI code.
- **The Durable Object is the source of truth.** All messages are persisted in the executor DO. The stream replays full history on connect, so the client can recover from disconnects or page reloads.
- **Handlers must be deterministic.** The replay engine uses a counter-based naming scheme (`relay-input-0`, `relay-input-1`, etc.). Handlers must always execute the same steps in the same order.

## Cross-Cutting Concerns

**Message protocol:** The `StreamMessage` Zod-validated discriminated union (on `type`) is the contract between SDK, DO, HTTP layer, and frontend. All message types are defined once in `isomorphic/messages.ts`.

**Input schema / type inference:** Relay now has two builder entry points for two different phases. `field.*` is used at workflow definition time in `createWorkflow({ input })` to declare upfront inputs. `input.*` is used inside a running workflow handler to request interactive inputs, and `input.group(title?, fields, options?)` composes multiple runtime field builders into one interaction. Both forms compile to `InputSchema` field definitions (`text`, `number`, `checkbox`, `select`) for the stream protocol and frontend renderer. `InputSchema` remains the transport/intermediate representation, not the primary public authoring API.

**Dual API surface:** Both the interactive API (browser: stream + events) and the call-response API (agents: blocking POST) share the same core execution functions in `workflow-api.ts`, avoiding divergence.

**Suspend/resume via replay:** When a workflow needs user input, it throws `SuspendExecution` to unwind the call stack. The handler's state is fully reconstructable from persisted step results and events, so replay is the resume mechanism. `step.sleep()` uses DO alarms to wake the executor after a delay.

## SDK Primitives

Top-level workflow definition helpers:

| Property                          | Signature                       | What it does                                             |
| --------------------------------- | ------------------------------- | -------------------------------------------------------- |
| `field.text(label, options?)`     | `=> InputFieldBuilder<string>`  | Defines an upfront text field for `createWorkflow()`     |
| `field.select(label, options)`    | `=> InputFieldBuilder<string>`  | Defines an upfront select field for `createWorkflow()`   |
| `field.number(label, options?)`   | `=> InputFieldBuilder<number>`  | Defines an upfront number field for `createWorkflow()`   |
| `field.checkbox(label, options?)` | `=> InputFieldBuilder<boolean>` | Defines an upfront checkbox field for `createWorkflow()` |

The handler context (`RelayContext`) passed to every workflow:

| Property                                     | Signature                        | What it does                                            |
| -------------------------------------------- | -------------------------------- | ------------------------------------------------------- |
| `output.markdown(content)`                   | `(string) => Promise<void>`      | Sends a markdown block                                  |
| `output.table({ title?, data })`             | `=> Promise<void>`               | Sends a data table                                      |
| `output.table({ source, ... })`              | `=> Promise<void>`               | Sends a loader-backed paginated table                   |
| `output.code({ code, language? })`           | `=> Promise<void>`               | Sends a code block                                      |
| `output.image({ src, alt? })`                | `=> Promise<void>`               | Sends an image                                          |
| `output.link({ url, title?, description? })` | `=> Promise<void>`               | Sends a link card                                       |
| `output.buttons(buttons)`                    | `=> Promise<void>`               | Sends action buttons                                    |
| `input(prompt)`                              | `(string) => Promise<string>`    | Text input, waits for response                          |
| `input.text(label, options?)`                | `=> InputFieldBuilder<string>`   | Awaitable text field builder                            |
| `input.select(label, options)`               | `=> InputFieldBuilder<string>`   | Awaitable select field builder                          |
| `input.number(label, options?)`              | `=> InputFieldBuilder<number>`   | Awaitable number field builder                          |
| `input.checkbox(label, options?)`            | `=> InputFieldBuilder<boolean>`  | Awaitable checkbox field builder                        |
| `input.group(title?, fields, options?)`      | `=> Promise<{ ...fields }>`      | Compose multiple field builders into one interaction    |
| `input(prompt, { buttons })`                 | `=> Promise<{ value, $choice }>` | Text input with custom buttons                          |
| `loading(msg, callback)`                     | `(string, cb) => Promise<void>`  | Shows spinner during async work                         |
| `confirm(msg)`                               | `(string) => Promise<boolean>`   | Approve/reject dialog                                   |
| `step`                                       | `ExecutorStep`                   | Step primitives (`step.do()`, `step.sleep()`)           |
| `data`                                       | `InferBuilderGroupResult<T>`     | Typed upfront input (only when field builders provided) |

## HTTP API

### Interactive API (browser clients)

| Method | Path                                 | Action                                                  |
| ------ | ------------------------------------ | ------------------------------------------------------- |
| `GET`  | `/workflows`                         | Returns workflow metadata list from registry            |
| `POST` | `/workflows`                         | Creates a new workflow instance, returns `{ id, name }` |
| `GET`  | `/workflows/:id/stream`              | Proxies to the executor DO's NDJSON stream              |
| `POST` | `/workflows/:id/event/:name`         | Submits user response (input value or confirm decision) |
| `POST` | `/workflows/:id/table/:stepId/query` | Queries a loader-backed table for pagination/search     |

## Loaders And Presenters

Loaders let a workflow emit a table without persisting all rows into the NDJSON
stream. Instead, `output.table({ source, ... })` stores a small table
descriptor in the run Durable Object and streams only a stable query endpoint.
The browser pages through that table by POSTing transient browsing state later.

The loader itself is still registered globally with the workflow definition, but
the handler receives a serializable `LoaderRef` rather than a direct callback.
That ref captures any bound params from the workflow run and is resolved against
the stored descriptor when the table query route executes.

Table descriptors live in the run DO keyed by `stepId` and hold the durable
table contract:

- loader name
- bound params
- table renderer name or serialized columns
- pagination defaults and row-key metadata

The query route receives only transient interaction state like `page`,
`pageSize`, and `query`, then the server re-runs the loader and returns a
normalized `{ columns, rows, totalCount }` payload to the frontend.

### Call-response API (agents)

| Method | Path                   | Action                                                  |
| ------ | ---------------------- | ------------------------------------------------------- |
| `POST` | `/api/run`             | Starts a workflow, blocks until first interaction point |
| `POST` | `/api/run/:id/respond` | Submits a response, blocks until next interaction point |

Both return a `CallResponseResult`:

```ts
{
  runId: string;
  status: "awaiting_input" | "awaiting_confirm" | "complete";
  messages: StreamMessage[];      // all messages since last interaction
  interaction: InputRequestMessage | ConfirmRequestMessage | null;
}
```

## How `input()` suspends and resumes

1. `field.*` and `input.*` builders compile into an `InputSchema`
2. `step.do(requestEvent)` → appends `input_request` message to the executor DO's message log and broadcasts to stream
3. `waitForEvent(eventName)` → throws `SuspendExecution`, unwinding the handler
4. Client submits form → `POST /workflows/:id/event/:name` → appends `input_received` to stream + persists event in DO storage as `event:{name}`
5. Executor replays the handler from the top — cached steps return instantly, the new event satisfies `waitForEvent`, and execution continues

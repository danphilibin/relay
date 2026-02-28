# Progress Log

Append-only log tracking high-level development milestones.

---

## Foundation (645f6f8 - dfabd6d)

Built initial prototype connecting Cloudflare Durable Objects with Cloudflare Workflows. Established a persistent readable stream per workflow run that can be connected to and streamed to from the client. Added HTML prototype UI and made it deployable.

## Multi-workflow Support (aec808b)

Extended architecture to support multiple workflows in a single worker. Each workflow gets registered and can be triggered independently.

## User Input (1c89bb9 - d309734)

Added `relay.input()` to pause workflow execution and wait for user input. Made workflows resumable so they can be interrupted and continued after receiving input.

## React Frontend (1f5d9d5 - 3c0af9b)

Replaced HTML prototype with React app using Vite. Built message-based UI that renders workflow output and input prompts. Made relay calls replay-safe using `step.do` for idempotency. Fixed duplicate message handling in frontend stream.

## Structured Input Schemas (67af00e - fad2db5)

Added Zod for schema validation. Input prompts now support structured schemas that generate forms in the UI. Moved input/output to root relay object.

## createWorkflow Helper (86fd52d - f80d002)

Added `createWorkflow()` function for more idiomatic workflow registration. Updated all example workflows to use the new pattern.

## UX Polish (8f566e4 - f5c094a)

Fixed request/response value pairing. Added 404 fallback, nicer loading states, "waiting" indicator for slow responses. Fixed layout shift and input value restoration.

## Button Support (338797b - 8485783)

Added button types to input prompts with primary/secondary/danger intents. Buttons return a `$choice` value indicating which was clicked. Improved type inference so button labels are typed as literals. Smart Enter key handling for single vs multiple buttons.

## SDK Cleanup (45214e4 - e451c7c)

Reorganized file structure. Separated client code from worker code for cleaner imports.

## Confirm Method (0a8c413)

Added `relay.confirm()` convenience method for yes/no prompts.

## Refund Example (fccb031)

Added refund workflow demonstrating complex branching logic with multiple decision paths.

## Workflow Completion (54add9b)

Added completion message when workflows finish, giving users clear feedback that execution is done.

## Kumo Component Library (e9ab255 - fec7819)

Integrated Kumo component library for UI elements. Added suppressAutoFocus option for better input control.

## Upfront Input Schema (416e009 - b67f13c)

Added upfront input schema support to `createWorkflow()`, allowing workflows to declare their input schema before execution begins. Added description fields to workflows and inputs for better discoverability.

## Agent Mode (1d0bf48 - 4bd73bb)

Added agent mode to the HTTP handler with MCP server support. Workflows can now be triggered and interacted with programmatically via an agent interface. Added remote config support.

## Isomorphic Code Organization (e533ea4 - a81e1bd)

Moved shared code (messages, input types, registry types) from `src/sdk/` into `src/isomorphic/` to create a clear filesystem boundary between frontend-safe code and backend-only Cloudflare Worker code.

## Field Registry Refactor (9c9d8c6 - 5709e79)

Refactored `InputRequestMessage` to use a field registry pattern. Per-field-type rendering is now in `SchemaFieldComponents.tsx` with a `FIELD_REGISTRY` map. Adding a new field type only requires one registry entry. Cleaned up `InferFieldType` utility.

## Rich Output Blocks (e9f381e - e9f381e)

Replaced plain-text `output(text)` with typed rich output blocks. Added isomorphic output schemas for `output.text`, `output.markdown`, `output.table`, `output.code`, `output.image`, `output.link`, and `output.buttons`; switched stream wire format to a single `output` message carrying a discriminated `block`; migrated SDK ergonomics to `output.<type>()`; updated existing workflows to use `output.text(...)`; and added client-side plain-text fallback rendering for all block types while preserving rich payloads for future component rendering.

## Frontend Rich Output Components (4d265a4 - uncommitted)

Implemented frontend rendering for structured output blocks by replacing the plain-text fallback path in `MessageList` with a dedicated `OutputMessage` component. Added minimal, schema-aligned UI handling for `output.text`, `output.markdown`, `output.table`, `output.code`, `output.image`, `output.link`, and `output.buttons`, using verified Kumo components (`Table`, `CodeBlock`, `Button`, `LinkButton`) where appropriate and preserving existing styling patterns.

## Rich Output Demo Workflow (6ae5195 - da2a9a8)

Added a new `Rich Output Demo` workflow to showcase all new rich output APIs end-to-end in one run. The workflow emits `output.text`, `output.markdown`, `output.table`, `output.code`, `output.image`, `output.link`, and `output.buttons`, and is registered in `src/index.ts` for immediate visibility in the UI.

## MCP Translation Contract Tests (757b141 - 757b141)

Introduced a shared SDK -> MCP translation module (`formatCallResponseForMcp`) with exhaustive handling for all `StreamMessage` variants (`output`, `input_request`, `input_received`, `loading`, `confirm_request`, `confirm_received`, `workflow_complete`). Refactored `mcp/server.ts` to consume this shared translator and typed input schema contracts. Added testing infrastructure with Vitest (`pnpm test`) and fixture-based golden tests that verify full call-response translation behavior across awaiting-input, awaiting-confirm, and complete states.

## MCP translation fixtures (fe184bf)

Updated mcp-translation test fixtures to use new output `block` format (`output.text`, etc.) instead of deprecated `text` property. All three golden tests pass.

## Simple input label deduplication (065cdac)

Fixed duplicate label rendering for simple `await input("prompt")` calls. The SDK normalizes simple prompts into a schema with `{ input: { label: prompt } }`, causing both the form title and field label to show the same text. Added client-side detection: when schema has exactly one field named `input`, the group title is hidden, showing only the field label.

## Markdown-only output path (uncommitted)

Simplified the rich output prototype to a single text output API by removing `output.text` from shared schemas and the SDK surface and standardizing on `output.markdown` everywhere. Updated frontend rendering, MCP translation fixtures, error fallback messages, and all existing workflows (including Rich Output Demo) to emit markdown-only output blocks.

## Enforce SDK client boundary in-place (aca07e6 - aca07e6)

- Added `src/sdk/client.ts` as the explicit client-safe surface for future `relayjs` usage, re-exporting browser-safe types/utilities from `src/isomorphic`.
- Updated all `app/` imports that referenced `src/isomorphic` internals to import from `@relayjs` instead.
- Added `@relayjs` path alias in `tsconfig.json` and introduced `tsconfig.app-boundary.json` to typecheck the app with only the SDK client alias available.
- Wired boundary verification into `typecheck` via `pnpm run typecheck:boundary`.
- Adjusted `useWorkflowStream` run-init typing/narrowing so the boundary-specific typecheck passes.

## Replace app boundary tsconfig with oxlint import boundary (cf6e2a6 - cf6e2a6)

- Added `.oxlintrc.json` override for `app/**/*.ts(x)` with `no-restricted-imports` to block `@/*` imports and require SDK access via `@relayjs`.
- Removed `tsconfig.app-boundary.json` and removed `typecheck:boundary` wiring from `package.json`.
- Verified boundary setup via `oxlint --print-config app/root.tsx`, and re-ran `pnpm run lint` and `pnpm exec tsc --noEmit`.

## Runtime API base URL for SPA decoupling (33fd30b - uncommitted)

Made the React Router frontend API target configurable so `app/` no longer assumes same-origin proxying to a local Worker. Added `app/lib/api.ts` with runtime-first resolution (`window.RELAY_API_URL`) and build-time fallback (`VITE_API_URL`), then switched all frontend workflow fetch calls in `app/root.tsx` and `app/hooks/useWorkflowStream.ts` to use the helper. Added `app/global.d.ts` for typed `window.RELAY_API_URL`, documented configuration in `README.md`, and verified a successful standalone frontend build via `VITE_API_URL=http://localhost:9999 pnpm build`.

## Playwright e2e setup and naming consolidation (7f4d316 - uncommitted)

- Added Playwright end-to-end coverage for the Ask Name flow with `tests/ask-name.e2e.spec.ts` (navigate, submit name, assert completion output).
- Added Playwright configuration in `playwright.config.ts` for local dev startup and Chromium execution.
- Added Playwright scripts in `package.json`: `test:e2e`, `test:e2e:ui`, and `test:e2e:install`.
- Added Playwright artifact ignores in `.gitignore` (`playwright-report`, `test-results`).
- This entry consolidates the prior incremental Playwright/smoke-to-e2e progress notes.

## Canonical SDK client boundary (uncommitted)

Made `src/sdk/client.ts` the single canonical client-facing SDK contract and removed duplicate barrel indirection through `src/isomorphic/index.ts`. `client.ts` now exports directly from `isomorphic` module files (`messages`, `mcp-translation`, `registry-types`, `input`, `output`), and `src/isomorphic/index.ts` was deleted to eliminate redundant public surfaces and enforce the SDK import boundary more strictly.

## Explicit isomorphic import ban in app boundary (uncommitted)

Tightened the app-side SDK boundary linting by adding an explicit `no-restricted-imports` rule for `@/isomorphic` and `@/isomorphic/*` in `.oxlintrc.json`. This documents intent directly alongside the broader `@/*` restriction and ensures app code must consume shared contracts through `@relayjs`.

## Workspace migration: two-package split (uncommitted)

Converted the monorepo into a pnpm workspace with three independently deployable packages:

- **`packages/sdk`** (`relay-sdk`) — The Cloudflare Relay SDK. Contains all isomorphic types (`messages`, `input`, `output`, `registry-types`, `mcp-translation`) and CF-specific code (`RelayWorkflow`, `RelayDurableObject`, `httpHandler`, registry, `createWorkflow`). Exports two entry points: `relay-sdk` (server, includes CF classes) and `relay-sdk/client` (browser-safe types only).
- **`packages/web`** (`relay-web`) — The React SPA. Moved from `app/` with its own Vite + React Router config. Imports shared types via `relay-sdk/client`. Builds independently.
- **`apps/examples`** (`relay-examples`) — Example Cloudflare Worker. Moved from `src/workflows/` + `src/index.ts`. Imports `createWorkflow`, `RelayWorkflow`, `RelayDurableObject`, and `httpHandler` from `relay-sdk`. Has its own `wrangler.jsonc`.

Root contains only workspace config (`pnpm-workspace.yaml`), scripts, MCP server, e2e tests, and dev tooling. No deployable code. All tsconfig path aliases crossing package boundaries replaced with proper workspace deps. `@relayjs` alias removed in favor of `relay-sdk/client` package import. oxlint rules updated for new paths.

## Move MCP server into relay-sdk (uncommitted)

Extracted the MCP server logic from the root `mcp/server.ts` into a new `relay-sdk/mcp` export (`packages/sdk/src/sdk/mcp.ts`). The SDK now exposes a `createRelayMcpServer({ apiUrl })` factory that encapsulates workflow discovery, InputSchema-to-Zod conversion, per-workflow tool registration, and the `relay_respond` tool. The root `mcp/server.ts` is now a three-line entrypoint that delegates to the SDK. Moved `@modelcontextprotocol/sdk` from root dependencies into `packages/sdk`; removed `zod` from root (already in SDK).

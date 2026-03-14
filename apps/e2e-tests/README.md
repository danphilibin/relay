# E2E Test Workflows

Dedicated Cloudflare Worker containing test workflows for the Playwright e2e suite. Each SDK primitive gets its own workflow so tests can exercise all permutations independently.

## Running

```bash
pnpm test:e2e          # runs Playwright (auto-starts servers)
pnpm test:e2e:ui       # interactive Playwright UI
pnpm dev:e2e           # start servers manually (worker:8788 + web:5174)
```

Runs on separate ports from `pnpm dev` so you can develop and test simultaneously:

| Service | Dev   | E2E   |
| ------- | ----- | ----- |
| Worker  | :8787 | :8788 |
| Web     | :5173 | :5174 |

## Workflows

### Input primitives

| Workflow               | What it tests                                           |
| ---------------------- | ------------------------------------------------------- |
| `input-text`           | Simple `input(prompt)` — returns string                 |
| `input-number`         | Number field in schema — returns number                 |
| `input-checkbox`       | Checkbox field in schema — returns boolean              |
| `input-select`         | Select field with options — returns string              |
| `input-mixed-schema`   | All four field types in one form, verifies all types    |
| `input-buttons`        | `input(prompt, { buttons })` — returns value + $choice  |
| `input-schema-buttons` | `input(prompt, schema, { buttons })` — fields + $choice |

### Output primitives

| Workflow          | What it tests                              |
| ----------------- | ------------------------------------------ |
| `output-markdown` | Headings, bold, inline code, lists         |
| `output-table`    | Title, column headers, data rows           |
| `output-code`     | Code block with language annotation        |
| `output-image`    | Image with alt text (data URI, no fetches) |
| `output-link`     | Link card with title and description       |
| `output-buttons`  | Action buttons with intents + URL buttons  |
| `output-metadata` | Key-value pairs with mixed value types     |

### Other primitives

| Workflow       | What it tests                         |
| -------------- | ------------------------------------- |
| `confirm-flow` | Approve and reject paths              |
| `loading-flow` | Loading spinner → completion callback |

## Patterns

**Value + type round-trip:** Input workflows echo back both the received value and `typeof` via `output.metadata()`, so tests verify the data round-trip and type correctness in a single assertion.

**No external dependencies:** Workflows avoid network calls or external state. The image test uses a data URI. Loading uses a 1-second `step.sleep()`.

**Adding a new test workflow:**

1. Create `src/workflows/my-test.ts` using `createWorkflow()`
2. Import it in `src/index.ts`
3. Add a spec in `tests/e2e/` (use `openWorkflow("my-test")` and `getMetadataValue()` from fixtures)

# Proposal: Run-Scoped Table Sessions

## Summary

The current loader design solves pagination, but it breaks down once a table
needs to preserve both:

- a typed source row (`User`)
- callback-based display logic (`renderCell(row)`)

This matters most for future interactive components like `input.table()`, where
we want the workflow author to work with `User[]` and get back a `User`, not a
separate display-shaped object.

The proposal is to keep loader definitions global, but make table interactions
run-scoped. Instead of the browser calling a stateless workflow-level loader
endpoint directly, it should call a per-run, per-table session endpoint.

## Problem

The current implementation has 3 issues:

1. Loader fetches are effectively stateless HTTP requests.
2. `renderCell(fn)` does not survive the serialization boundary cleanly.
3. Future `input.table()` wants typed rows in and typed rows out.

Those pressures conflict:

- If the loader returns display-ready rows, the table can render rich UI, but
  `input.table()` no longer returns the original `User`.
- If the loader returns `User[]`, the callback-based display logic has to live
  somewhere server-side between requests.

## Requirements

We want to support all of this without inventing a large UI DSL:

- paginated/searchable datasets fetched outside the main workflow lifecycle
- typed loader rows, e.g. `User[]`
- callback-based column rendering against the typed row
- choosing which columns to show without mutating the underlying row type
- row actions that can access the row, e.g. "Edit" using `row.id`
- future `input.table<User>()` returning `User`

## Proposal

### 1. Keep loaders as typed row producers

Loaders should continue returning the real row type:

```ts
const users = loader(async ({ query, page, pageSize }, env) => {
  const data = await db.users.findMany(...);
  return { data, totalCount };
});
```

That means loaders remain the source of truth for data, filtering, paging, and
search.

### 2. Preserve callback-based table config

Table config should still be allowed to describe display logic against the row:

```ts
await output.table({
  source: loaders.users,
  columns: [
    "email",
    {
      label: "Display",
      renderCell: (user) => `${user.name} <${user.email}>`,
    },
  ],
  rowActions: [
    {
      label: "Edit",
      href: (user) => `/workflows/edit-user?id=${user.id}`,
    },
  ],
});
```

This is still the best product shape. The mistake is not the callback API
itself; the mistake is trying to serve it from a stateless workflow-level HTTP
endpoint.

### 3. Introduce a run-scoped table session

When a workflow emits a loader-backed table, Relay should create a table session
identified by:

- `runId`
- `stepId`

This session belongs to one workflow run and one rendered table instance.

The session stores the table definition:

- loader name
- bound loader params
- page size
- column definitions
- callback-based renderers
- row actions

The browser then fetches data from a run-scoped endpoint, conceptually:

```txt
GET /runs/:runId/tables/:stepId?page=0&pageSize=20&query=alice
```

not:

```txt
GET /workflows/:slug/loader/:name?page=0&pageSize=20&query=alice
```

### 4. The session endpoint returns both source rows and rendered cells

The key idea is that the server keeps the distinction between:

- the original typed row
- the rendered representation of that row for the table UI

Conceptually:

```ts
type TablePage<TRow> = {
  rows: Array<{
    source: TRow;
    cells: RenderedCell[];
  }>;
  totalCount?: number;
};
```

The browser renders `cells`.

If this later powers `input.table<User>()`, the browser can submit `source`
back when the user selects a row, so the workflow receives a `User`, not a
display-shaped object.

## Why This Helps

This preserves the good parts of the callback model:

- table authors can write normal TypeScript instead of a config DSL
- display logic stays separate from the row's data type
- row actions can access the full typed row
- `input.table<User>()` can return `User`

It also fixes the architecture problems:

- no workflow-global render registry keyed only by `stepId`
- no cross-run collisions
- no need for the browser to understand arbitrary render logic

## API Sketch

This is the intended shape, not final syntax:

```ts
const selectUser = await input.table({
  source: loaders.users,
  columns: [
    "email",
    {
      label: "Status",
      renderCell: (user) => {
        if (!user.status) return "Unknown";
        if (user.status === "active") return "Active";
        return "Inactive";
      },
    },
  ],
  rowActions: [
    {
      label: "Edit",
      href: (user) => `/workflows/edit-user?id=${user.id}`,
    },
  ],
});
// selectUser: User
```

## Implementation Notes

This proposal changes the interaction model, not the loader definition model:

- loader definitions can still be registered globally via `createWorkflow()`
- bound loader params are still derived at workflow runtime
- the UI should no longer call the workflow-level loader endpoint for
  callback-bearing interactive tables

The hard implementation question is where callback definitions live between
requests. They cannot be serialized into the NDJSON stream. They also should not
live in a workflow-global registry keyed only by `stepId`.

The likely answer is to attach them to run-scoped session state owned by the
server side of the active workflow session.

## Open Questions

1. What is the right runtime home for table session state?
   A Durable Object associated with the run is the most obvious candidate.

2. How durable must callback-bearing table sessions be?
   If the owning process restarts, do we need to rehydrate the session by
   reconstructing the table definition from workflow state?

3. Should `output.table()` and `input.table()` share the same session model?
   Probably yes. The output version can ignore row selection, while the input
   version uses the same session mechanics plus submission.

4. Do we still want a simpler stateless loader endpoint?
   Maybe. It could remain useful for plain read-only browsing where callback
   rendering and typed row round-tripping are not needed.

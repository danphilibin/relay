This PR introduces loaders

## Problem

`output.table` currently requires passing all rows as a data array, which gets persisted in the NDJSON stream. This doesn't work for large datasets — a table browsing 10,000 users would write all 10,000 rows into the stream permanently.

We need a pattern where:

- The UI can paginate and search through large datasets
- Data is fetched on demand via HTTP, outside the workflow lifecycle
- Only metadata (not data) is persisted in the NDJSON stream

## Solution: loaders

Loaders are functions registered alongside a workflow that execute in the Worker's fetch handler, completely outside the workflow lifecycle. While a workflow is paused or has moved past a table step, the UI makes direct HTTP calls to the loader endpoint for pagination and search.

The idea is something that looks roughly like this:

```ts
import { createWorkflow, loader } from "relay-sdk";

createWorkflow({
  name: "List Users",
  loaders: {
    // No custom params — TRow inferred from db return type
    users: loader(async ({ query, page, pageSize }, env) => {
      const where = query ? { name: { contains: query } } : undefined;
      const [data, totalCount] = await Promise.all([
        db.users.findMany({ where, limit: pageSize, offset: page * pageSize }),
        db.users.count({ where }),
      ]);
      return { data, totalCount };
    }),

    // Custom params — type-checked via descriptor
    deptUsers: loader(
      { department: "string" },
      async ({ department, query, page, pageSize }, env) => {
        const data = await db.users.findMany({
          where: { department },
          limit: pageSize,
          offset: page * pageSize,
        });
        return { data };
      },
    ),
  },

  handler: async ({ output, loaders }) => {
    // No columns — auto-derive from data
    await output.table({ source: loaders.users, pageSize: 20 });

    // String shorthand columns — checked against row type
    await output.table({
      source: loaders.users,
      columns: ["name", "email"],
    });

    // Custom column labels
    await output.table({
      source: loaders.users,
      columns: [
        { label: "Full Name", accessorKey: "name" },
        { label: "Email", accessorKey: "email" },
      ],
    });

    // Computed columns via renderCell
    await output.table({
      source: loaders.users,
      columns: [
        "id",
        { label: "Display", renderCell: (row) => `${row.name} <${row.email}>` },
      ],
    });

    // Run-scoped params — bound at call site, forwarded with every request
    await output.table({
      title: "Engineering",
      source: loaders.deptUsers({ department: "eng" }),
      pageSize: 20,
    });
  },
});
```

Loaders will generally wrap database calls (e.g. `await prisma.users.findMany()`).

## Success criteria

- Loaders defined outside of the function lifecycle
- Loaders produce strong type safety
  - Accessing loaders within a workflow references the `loaders` attribute in `createWorkflow()`
  - Results from a table are typed according to the type of data fed into the table
- Table columns inferred from data by default; supports customization (likely plain string (simple mode) | object (advanced mode))
- Loaders need to support input params (think: a loader that require input from a previous step)
- Future elements (input.table, input.multiSelect, etc) can use the same pattern
- Loaders are easy to reason about when reading a workflow's code
- Nice DX; minimal boilerplate for workflow authors - easy to document + reason about
- Strong architecture; no flaky workarounds

## Open questions

- Are there scenarios where we _would_ want table data to persist in the NDJSON stream? And how would you do that? (I think you just pass `data` and we document `data` vs `loader`?)
- Relay doesn't currently have auth; do we have a story for authenticating loader endpoints when we do eventually add auth?
- What happens in an MCP session if an agent encounters a component that uses a loader?

## Architecture gotchas

- `renderCell` functions must be scoped to a workflow instance/session, not just a workflow-level registry keyed by `stepId`. Step IDs are reused across workflow runs, so any render state must also be cleaned up correctly.

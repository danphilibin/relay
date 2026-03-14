import { createWorkflow } from "relay-sdk";

/**
 * Tests output.table() with title and data rows.
 */
export const outputTable = createWorkflow({
  name: "Output Table",
  handler: async ({ output }) => {
    await output.table({
      title: "Users",
      data: [
        { Name: "Alice", Role: "Admin", Status: "Active" },
        { Name: "Bob", Role: "Editor", Status: "Inactive" },
      ],
    });
  },
});

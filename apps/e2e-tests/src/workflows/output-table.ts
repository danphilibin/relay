import { createWorkflow } from "relay-sdk";

/**
 * Tests output.table() with label and data rows.
 */
export const outputTable = createWorkflow({
  name: "Output Table",
  handler: async ({ output }) => {
    await output.table({
      label: "Users",
      data: [
        { Name: "Alice", Role: "Admin", Status: "Active" },
        { Name: "Bob", Role: "Editor", Status: "Inactive" },
      ],
    });
  },
});

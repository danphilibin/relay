import { createWorkflow } from "relay-sdk";

/**
 * Tests `input("prompt", schema, { buttons: [...] })` overload.
 * Verifies the response includes typed schema fields + `$choice`.
 */
export const inputSchemaButtons = createWorkflow({
  name: "Input Schema Buttons",
  handler: async ({ input, output }) => {
    const result = await input(
      "Review the entry",
      {
        note: { type: "text", label: "Note", placeholder: "Add a note..." },
      },
      {
        buttons: ["Approve", { label: "Reject", intent: "danger" }],
      },
    );
    await output.metadata({
      title: "Result",
      data: {
        note: result.note,
        noteType: typeof result.note,
        choice: result.$choice,
      },
    });
  },
});

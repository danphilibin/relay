import { createWorkflow } from "relay-sdk";

/**
 * Tests `input.group("prompt", fields, { buttons: [...] })`.
 * Verifies the response includes typed schema fields + `$choice`.
 */
export const inputSchemaButtons = createWorkflow({
  name: "Input Schema Buttons",
  handler: async ({ input, output }) => {
    const result = await input.group(
      "Review the entry",
      {
        note: input.text("Note", { placeholder: "Add a note..." }),
      },
      {
        buttons: ["Approve", { label: "Reject", intent: "danger" }],
      },
    );
    await output.metadata({
      label: "Result",
      data: {
        note: result.note,
        noteType: typeof result.note,
        choice: result.$choice,
      },
    });
  },
});

import { createWorkflow } from "relay-sdk";

/**
 * Tests `input.group(..., { buttons: [...] })`.
 * Verifies the response includes `value` and `$choice`.
 */
export const inputButtons = createWorkflow({
  name: "Input Buttons",
  handler: async ({ input, output }) => {
    const result = await input.group(
      { value: input.text("Enter a message") },
      { buttons: ["Save", { label: "Discard", intent: "danger" }] },
    );
    await output.metadata({
      label: "Result",
      data: {
        value: result.value,
        choice: result.$choice,
      },
    });
  },
});

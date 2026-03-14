import { createWorkflow } from "relay-sdk";

/**
 * Tests `input("prompt", { buttons: [...] })` overload.
 * Verifies the response includes `value` and `$choice`.
 */
export const inputButtons = createWorkflow({
  name: "Input Buttons",
  handler: async ({ input, output }) => {
    const result = await input("Enter a message", {
      buttons: ["Save", { label: "Discard", intent: "danger" }],
    });
    await output.metadata({
      title: "Result",
      data: {
        value: result.value,
        choice: result.$choice,
      },
    });
  },
});

import { createWorkflow } from "relay-sdk";

/**
 * Tests a group with a single number builder.
 * Verifies the returned value is typed as a number.
 */
export const inputNumber = createWorkflow({
  name: "Input Number",
  handler: async ({ input, output }) => {
    const result = await input.group("Enter a number", {
      quantity: input.number("Quantity", {
        description: "How many items?",
        placeholder: "10",
      }),
    });
    await output.metadata({
      label: "Result",
      data: {
        value: result.quantity,
        type: typeof result.quantity,
      },
    });
  },
});

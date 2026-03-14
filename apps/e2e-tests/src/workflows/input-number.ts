import { createWorkflow } from "relay-sdk";

/**
 * Tests a schema with a single number field.
 * Verifies the returned value is typed as a number.
 */
export const inputNumber = createWorkflow({
  name: "Input Number",
  handler: async ({ input, output }) => {
    const result = await input("Enter a number", {
      quantity: {
        type: "number",
        label: "Quantity",
        description: "How many items?",
        placeholder: "10",
      },
    });
    await output.metadata({
      title: "Result",
      data: {
        value: result.quantity,
        type: typeof result.quantity,
      },
    });
  },
});

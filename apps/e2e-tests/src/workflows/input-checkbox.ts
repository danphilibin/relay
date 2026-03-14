import { createWorkflow } from "relay-sdk";

/**
 * Tests a schema with a single checkbox field.
 * Verifies the returned value is typed as a boolean.
 */
export const inputCheckbox = createWorkflow({
  name: "Input Checkbox",
  handler: async ({ input, output }) => {
    const result = await input("Toggle the checkbox", {
      agree: {
        type: "checkbox",
        label: "I agree to the terms",
        description: "You must agree to continue",
      },
    });
    await output.metadata({
      title: "Result",
      data: {
        value: result.agree,
        type: typeof result.agree,
      },
    });
  },
});

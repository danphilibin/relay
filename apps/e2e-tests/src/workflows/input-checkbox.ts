import { createWorkflow } from "relay-sdk";

/**
 * Tests a group with a single checkbox builder.
 * Verifies the returned value is typed as a boolean.
 */
export const inputCheckbox = createWorkflow({
  name: "Input Checkbox",
  handler: async ({ input, output }) => {
    const result = await input.group("Toggle the checkbox", {
      agree: input.checkbox("I agree to the terms", {
        description: "You must agree to continue",
      }),
    });
    await output.metadata({
      label: "Result",
      data: {
        value: result.agree,
        type: typeof result.agree,
      },
    });
  },
});

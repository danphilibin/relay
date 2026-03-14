import { createWorkflow } from "relay-sdk";

/**
 * Tests the simple `input("prompt")` overload.
 * Verifies that the return value is a string.
 */
export const inputText = createWorkflow({
  name: "Input Text",
  handler: async ({ input, output }) => {
    const value = await input("Enter your name");
    await output.metadata({
      title: "Result",
      data: {
        value: value,
        type: typeof value,
      },
    });
  },
});

import { createWorkflow } from "relay-sdk";

/**
 * Tests a group with a single select builder.
 * Verifies the selected option value is returned as a string.
 */
export const inputSelect = createWorkflow({
  name: "Input Select",
  handler: async ({ input, output }) => {
    const result = await input.group("Pick a color", {
      color: input.select("Favorite color", {
        description: "Choose one",
        options: [
          { value: "red", label: "Red" },
          { value: "green", label: "Green" },
          { value: "blue", label: "Blue" },
        ],
      }),
    });
    await output.metadata({
      label: "Result",
      data: {
        value: result.color,
        type: typeof result.color,
      },
    });
  },
});

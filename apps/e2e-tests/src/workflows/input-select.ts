import { createWorkflow } from "relay-sdk";

/**
 * Tests a schema with a single select field.
 * Verifies the selected option value is returned as a string.
 */
export const inputSelect = createWorkflow({
  name: "Input Select",
  handler: async ({ input, output }) => {
    const result = await input("Pick a color", {
      color: {
        type: "select",
        label: "Favorite color",
        description: "Choose one",
        options: [
          { value: "red", label: "Red" },
          { value: "green", label: "Green" },
          { value: "blue", label: "Blue" },
        ],
      },
    });
    await output.metadata({
      title: "Result",
      data: {
        value: result.color,
        type: typeof result.color,
      },
    });
  },
});

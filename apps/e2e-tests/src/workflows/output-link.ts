import { createWorkflow } from "relay-sdk";

/**
 * Tests output.link() with all optional properties.
 */
export const outputLink = createWorkflow({
  name: "Output Link",
  handler: async ({ output }) => {
    await output.link({
      url: "https://example.com",
      title: "Example Site",
      description: "A link to an example website",
    });
  },
});

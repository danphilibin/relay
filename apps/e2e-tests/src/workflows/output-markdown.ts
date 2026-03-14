import { createWorkflow } from "relay-sdk";

/**
 * Tests output.markdown() with various markdown features.
 */
export const outputMarkdown = createWorkflow({
  name: "Output Markdown",
  handler: async ({ output }) => {
    await output.markdown("# Test Heading");
    await output.markdown("This is a **bold** paragraph with `inline code`.");
    await output.markdown("- Item one\n- Item two\n- Item three");
  },
});

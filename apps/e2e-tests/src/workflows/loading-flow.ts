import { createWorkflow } from "relay-sdk";

/**
 * Tests the loading() primitive with a completion callback.
 */
export const loadingFlow = createWorkflow({
  name: "Loading Flow",
  handler: async ({ step, loading, output }) => {
    await loading("Processing data...", async ({ complete }) => {
      await step.sleep("loading-delay", "1 second");
      complete("Data processed!");
    });
    await output.markdown("Loading complete.");
  },
});

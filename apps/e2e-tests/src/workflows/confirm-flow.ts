import { createWorkflow } from "relay-sdk";

/**
 * Tests the confirm() primitive.
 * Shows a confirmation prompt, then outputs the decision.
 */
export const confirmFlow = createWorkflow({
  name: "Confirm Flow",
  handler: async ({ confirm, output }) => {
    const approved = await confirm("Do you approve this action?");
    await output.metadata({
      title: "Result",
      data: {
        approved: approved,
        type: typeof approved,
      },
    });
  },
});

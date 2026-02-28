import { createWorkflow } from "relay-sdk";

export const approvalTest = createWorkflow({
  name: "Approval Test",
  handler: async ({ input, output, confirm }) => {
    const amount = await input("Enter refund amount:", {
      amount: { type: "number", label: "Amount ($)" },
    });

    await output.markdown(`Processing refund for $${amount.amount}...`);

    // Require approval for amounts over $100
    if (amount.amount > 100) {
      const approved = await confirm(
        `Refund of $${amount.amount} exceeds $100 threshold. Approval required.`,
      );

      if (!approved) {
        await output.markdown(`Refund rejected.`);
        return;
      }

      await output.markdown("Refund approved!");
    }

    await output.markdown(
      `Refund of $${amount.amount} processed successfully.`,
    );
  },
});

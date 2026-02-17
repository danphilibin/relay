import { createWorkflow } from "@/sdk";

export const approvalTest = createWorkflow({
  name: "Approval Test",
  handler: async ({ input, output, confirm }) => {
    const amount = await input("Enter refund amount:", {
      amount: { type: "number", label: "Amount ($)" },
    });

    await output(`Processing refund for $${amount.amount}...`);

    // Require approval for amounts over $100
    if (amount.amount > 100) {
      const approved = await confirm(
        `Refund of $${amount.amount} exceeds $100 threshold. Approval required.`,
      );

      if (!approved) {
        await output(`Refund rejected.`);
        return;
      }

      await output("Refund approved!");
    }

    await output(`Refund of $${amount.amount} processed successfully.`);
  },
});

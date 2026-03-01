import { createWorkflow } from "relay-sdk";

export const refund = createWorkflow({
  name: "Process Refund",
  description:
    "Look up an order, select items, and process a refund with policy validation and approval gates.",
  handler: async ({ input, output, confirm }) => {
    const { orderId } = await input("Enter order information", {
      orderId: { type: "text", label: "Order ID" },
    });
    
    // Simulated order lookup
    const order = {
      id: orderId,
      customer: "Jane Smith",
      email: "jane@example.com",
      items: [
        { id: "item_1", name: "Wireless Headphones", price: 149.99 },
        { id: "item_2", name: "Phone Case", price: 29.99 },
        { id: "item_3", name: "USB-C Cable", price: 19.99 },
      ],
    };

    // Step 2: Select items to refund
    const selection = await input("Select items to refund", {
      item_1: {
        type: "checkbox",
        label: `${order.items[0].name} ($${order.items[0].price})`,
      },
      item_2: {
        type: "checkbox",
        label: `${order.items[1].name} ($${order.items[1].price})`,
      },
      item_3: {
        type: "checkbox",
        label: `${order.items[2].name} ($${order.items[2].price})`,
      },
    });

    const selectedItems = order.items.filter((_, i) => {
      const key = `item_${i + 1}` as keyof typeof selection;
      return selection[key];
    });

    if (selectedItems.length === 0) {
      await output.markdown("No items selected. Refund cancelled.");
      return;
    }

    const refundTotal = selectedItems.reduce(
      (sum, item) => sum + item.price,
      0,
    );

    // Step 3: Get refund reason
    const { reason, reasonDetail } = await input("Refund reason", {
      reason: {
        type: "select",
        label: "Reason",
        options: [
          { value: "defective", label: "Defective product" },
          { value: "wrong_item", label: "Wrong item received" },
          { value: "changed_mind", label: "Changed mind" },
          { value: "duplicate", label: "Duplicate order" },
          { value: "other", label: "Other" },
        ],
      },
      reasonDetail: {
        type: "text",
        label: "Additional details (optional)",
      },
    });

    await output.markdown(
      `## Refund Summary\n\n` +
        `**Items:**\n` +
        selectedItems.map((i) => `- ${i.name}`).join("\n") +
        `\n\n**Total:** $${refundTotal.toFixed(2)}  \n` +
        `**Reason:** ${reason}${reasonDetail ? ` — ${reasonDetail}` : ""}`,
    );

    // Step 4: Policy validation
    if (refundTotal > 100) {
      const approved = await confirm(
        `Refund requires approval: Amount ($${refundTotal.toFixed(2)}) exceeds $100 threshold.`,
      );
      if (!approved) {
        await output.markdown("❌ **Refund rejected** during approval.");
        return;
      }
      await output.markdown("✅ **Approval** received.");
    }

    // Step 5: Process refund
    const refundId = `REF-${Date.now()}`;

    await output.markdown(
      `## ✅ Refund Processed Successfully!\n\n` +
        `**Refund ID:** \`${refundId}\`  \n` +
        `**Amount:** $${refundTotal.toFixed(2)}  \n` +
        `**Confirmation email** sent to ${order.email}`,
    );
  },
});

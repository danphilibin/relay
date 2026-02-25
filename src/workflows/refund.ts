import { createWorkflow } from "@/sdk";

export const refund = createWorkflow({
  name: "Process Refund",
  description:
    "Look up an order, select items, and process a refund with policy validation and approval gates.",
  handler: async ({ input, output, confirm }) => {
    // Step 1: Look up order
    const { orderId } = await input("Enter order information", {
      orderId: { type: "text", label: "Order ID" },
    });

    // Simulated order lookup
    const order = {
      id: orderId,
      customer: "Jane Smith",
      email: "jane@example.com",
      createdAt: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000), // 15 days ago
      items: [
        { id: "item_1", name: "Wireless Headphones", price: 149.99 },
        { id: "item_2", name: "Phone Case", price: 29.99 },
        { id: "item_3", name: "USB-C Cable", price: 19.99 },
      ],
    };

    const daysSincePurchase = Math.floor(
      (Date.now() - order.createdAt.getTime()) / (1000 * 60 * 60 * 24),
    );

    await output.markdown(
      `## Order ${order.id}\n\n` +
        `**Customer:** ${order.customer} (${order.email})  \n` +
        `**Placed:** ${daysSincePurchase} days ago\n\n` +
        `**Items:**\n` +
        order.items.map((i) => `- ${i.name} — **$${i.price}**`).join("\n"),
    );

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
    if (daysSincePurchase > 90) {
      await output.markdown(
        "⚠️ **Refund rejected:** Order is outside the 90-day refund window.",
      );
      return;
    }

    if (daysSincePurchase > 30) {
      const approved = await confirm(
        `Refund requires manager approval: Order is ${daysSincePurchase} days old (outside 30-day window).`,
      );
      if (!approved) {
        await output.markdown("❌ **Refund rejected** by manager.");
        return;
      }
      await output.markdown("✅ **Manager approval** received.");
    }

    if (refundTotal > 500) {
      const approved = await confirm(
        `Refund requires escalation: Amount ($${refundTotal.toFixed(2)}) exceeds $500 threshold.`,
      );
      if (!approved) {
        await output.markdown("❌ **Refund rejected** during escalation.");
        return;
      }
      await output.markdown("✅ **Escalation** approved.");
    }

    // Step 5: Process refund
    const refundId = `REF-${Date.now()}`;
    const processorRef = `STRIPE-${Math.random().toString(36).slice(2, 10).toUpperCase()}`;

    await output.markdown(
      `## ✅ Refund Processed Successfully!\n\n` +
        `**Refund ID:** \`${refundId}\`  \n` +
        `**Amount:** $${refundTotal.toFixed(2)}  \n` +
        `**Processor Reference:** \`${processorRef}\`  \n` +
        `**Confirmation email** sent to ${order.email}`,
    );
  },
});

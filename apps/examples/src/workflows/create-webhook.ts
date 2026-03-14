import { createWorkflow } from "relay-sdk";

export const createWebhook = createWorkflow({
  name: "Create Webhook",
  description:
    "Configure a webhook endpoint with event subscriptions and test it.",
  handler: async ({ input, output }) => {
    const { url, contentType } = await input.group("Configure your webhook", {
      url: input.text("Endpoint URL", {
        placeholder: "https://api.example.com/webhooks",
      }),
      contentType: input.select("Content type", {
        options: [
          { value: "json", label: "application/json" },
          { value: "form", label: "application/x-www-form-urlencoded" },
        ],
      }),
    });

    const { events } = await input.group(
      "Which events should trigger this webhook?",
      {
        events: input.select("Event", {
          options: [
            { value: "order.created", label: "Order created" },
            { value: "order.updated", label: "Order updated" },
            { value: "payment.completed", label: "Payment completed" },
            { value: "refund.processed", label: "Refund processed" },
          ],
        }),
      },
    );

    const payload = {
      event: events,
      timestamp: "2026-03-04T12:00:00Z",
      data: {
        id: "evt_abc123",
        order_id: "ORD-12345",
        amount: 49.99,
        currency: "USD",
      },
    };

    await output.markdown(`### Example payload for \`${events}\``);
    await output.code({
      code: JSON.stringify(payload, null, 2),
      language: "json",
    });

    const curlContentType =
      contentType === "json"
        ? "application/json"
        : "application/x-www-form-urlencoded";

    await output.markdown("### Test it");
    await output.code({
      code: `curl -X POST ${url} \\\n  -H "Content-Type: ${curlContentType}" \\\n  -H "X-Webhook-Secret: whsec_..." \\\n  -d '${JSON.stringify(payload)}'`,
      language: "bash",
    });

    await output.image({
      src: "https://placehold.co/800x200/0f172a/38bdf8?text=Webhook+Flow:+Event+→+Queue+→+POST+Endpoint",
      alt: "Webhook delivery flow diagram",
    });

    await output.markdown(
      `Webhook configured for **${events}** events → \`${url}\``,
    );
  },
});

import { createWorkflow } from "@/sdk";

export const newsletterSignup = createWorkflow({
  name: "Newsletter Signup",
  description: "Collect user info and subscribe them to the newsletter.",
  input: {
    name: { type: "text", label: "Your name" },
    email: { type: "text", label: "Email address" },
    newsletter: { type: "checkbox", label: "Subscribe to updates?" },
  },
  handler: async ({ step, data, output, loading }) => {
    if (data.newsletter) {
      await loading("Subscribing to newsletter...", async ({ complete }) => {
        await step.sleep("subscribe-delay", "2 seconds");
        complete("Subscribed to newsletter!");
      });
    }

    await output.text(`Thanks, ${data.name}! Check ${data.email} for next steps.`);
  },
});

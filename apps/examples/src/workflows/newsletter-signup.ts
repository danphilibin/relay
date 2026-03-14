import { createWorkflow, field } from "relay-sdk";

export const newsletterSignup = createWorkflow({
  name: "Newsletter Signup",
  description: "Collect user info and subscribe them to the newsletter.",
  input: {
    name: field.text("Your name"),
    email: field.text("Email address"),
    newsletter: field.checkbox("Subscribe to updates?"),
  },
  handler: async ({ step, data, output, loading }) => {
    if (data.newsletter) {
      await loading("Subscribing to newsletter...", async ({ complete }) => {
        await step.sleep("subscribe-delay", "2 seconds");
        complete("Subscribed to newsletter!");
      });
    }

    await output.markdown(
      `Thanks, ${data.name}! Check ${data.email} for next steps.`,
    );
  },
});

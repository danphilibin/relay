import { createWorkflow, field } from "relay-sdk";

export const newsletterSignup = createWorkflow({
  name: "Newsletter Signup",
  description: "Subscribe a user to the newsletter.",
  input: {
    name: field.text("Your name"),
    email: field.text("Email address"),
  },
  handler: async ({ step, data, output, loading }) => {
    await loading("Subscribing to newsletter...", async ({ complete }) => {
      await step.sleep("subscribe-delay", "2 seconds");
      complete("Subscribed to newsletter!");
    });

    await output.markdown(`Thanks, ${data.name}! You're now subscribed.`);
  },
});

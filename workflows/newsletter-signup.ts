import type { RelayContext } from "../src/sdk/workflow";

export const newsletterSignup = async ({
  step,
  input,
  output,
  loading,
}: RelayContext) => {
  const name = await input("What is your name?");

  const { email, newsletter } = await input("Enter more info", {
    email: { type: "text", label: "Email address" },
    newsletter: { type: "checkbox", label: "Subscribe to updates?" },
  });

  if (newsletter) {
    await loading("Subscribing to newsletter...", async ({ complete }) => {
      await step.sleep("subscribe-delay", "2 seconds");
      complete("Subscribed to newsletter!");
    });
  }

  await output(`Thanks, ${name}! Check ${email} for next steps.`);
};

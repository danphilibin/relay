import { createWorkflow } from "relay-sdk";

export const askName = createWorkflow({
  name: "Ask Name",
  handler: async ({ input, output }) => {
    await output.markdown("Hello! I'd like to get to know you.");
    const name = await input("What's your name?");
    await output.markdown(`Nice to meet you, ${name}!`);
  },
});

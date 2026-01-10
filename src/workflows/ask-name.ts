import { createWorkflow } from "@/sdk";

export const askName = createWorkflow({
  name: "Ask Name",
  handler: async ({ input, output }) => {
    await output("Hello! I'd like to get to know you.");
    const name = await input("What's your name?");
    await output(`Nice to meet you, ${name}!`);
  },
});

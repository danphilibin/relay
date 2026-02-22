import { createWorkflow } from "@/sdk";

export const askName = createWorkflow({
  name: "Ask Name",
  handler: async ({ input, output }) => {
    await output.text("Hello! I'd like to get to know you.");
    const name = await input("What's your name?");
    await output.text(`Nice to meet you, ${name}!`);
  },
});

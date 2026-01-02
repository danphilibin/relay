import { createWorkflow } from "../src/sdk/types";

export const askName = createWorkflow(async ({ step, input, output }) => {
  await output("Hello! I'd like to get to know you.");
  const name = await input("What's your name?");
  await output(`Nice to meet you, ${name}!`);
});

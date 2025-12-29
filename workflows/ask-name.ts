import { createWorkflow } from "../src/sdk/types";

export const askName = createWorkflow(async ({ step, relay }) => {
  await relay.output("Hello! I'd like to get to know you.");
  const name = await relay.input("What's your name?");
  await relay.output(`Nice to meet you, ${name}!`);
  await step.sleep("pause", "2 seconds");
  await relay.output(`Your name has ${name.length} letters.`);
  await relay.output("Thanks for trying out bi-directional messaging!");
});

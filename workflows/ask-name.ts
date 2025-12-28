import { defineWorkflow } from "../src/workflow-sdk";

export const askName = defineWorkflow(async ({ step, relay, params }) => {
  await relay.output("Hello! I'd like to get to know you.");

  // Request input and wait for response
  const name = await relay.input("What's your name?");

  // Send confirmation
  await relay.output(`Nice to meet you, ${name}!`);

  await step.sleep("pause", "2 seconds");

  await relay.output(`Your name has ${name.length} letters.`);
  await relay.output("Thanks for trying out bi-directional messaging!");
});

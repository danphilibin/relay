import type { WorkflowContext } from "../src/sdk/workflow";

export const askName = async ({ input, output }: WorkflowContext) => {
  await output("Hello! I'd like to get to know you.");
  const name = await input("What's your name?");
  await output(`Nice to meet you, ${name}!`);
};

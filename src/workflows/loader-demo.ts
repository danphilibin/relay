import { createWorkflow } from "@/sdk/workflow";

export const loaderDemo = createWorkflow({
  name: "Loader Demo",
  loaders: {
    randomNumber: async ({ min = 1, max = 100 }) => {
      const minNum = Number(min);
      const maxNum = Number(max);
      return Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum;
    },
  },
  handler: async ({ input, output }) => {
    const max = await input("Enter max number:");

    await output.button("Random Number", {
      loader: "randomNumber",
      context: { max: Number(max) },
    });

    await output("Click the button above to generate a new number.");
  },
});

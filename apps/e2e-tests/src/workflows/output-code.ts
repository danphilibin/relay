import { createWorkflow } from "relay-sdk";

/**
 * Tests output.code() with language annotation.
 */
export const outputCode = createWorkflow({
  name: "Output Code",
  handler: async ({ output }) => {
    await output.code({
      code: "function greet(name: string) {\n  return `Hello, ${name}!`;\n}",
      language: "typescript",
    });
  },
});

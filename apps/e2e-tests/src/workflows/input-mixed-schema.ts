import { createWorkflow } from "relay-sdk";

/**
 * Tests a group with all four field builder types in a single form.
 * Verifies each field returns the correct type.
 */
export const inputMixedSchema = createWorkflow({
  name: "Input Mixed Schema",
  handler: async ({ input, output }) => {
    const result = await input.group("Fill out the form", {
      name: input.text("Name", {
        placeholder: "Jane Doe",
        required: true,
      }),
      age: input.number("Age", {
        placeholder: "25",
      }),
      subscribe: input.checkbox("Subscribe to updates", {
        description: "We'll send you occasional emails",
      }),
      plan: input.select("Plan", {
        options: [
          { value: "free", label: "Free" },
          { value: "pro", label: "Pro" },
          { value: "enterprise", label: "Enterprise" },
        ],
      }),
    });
    await output.metadata({
      label: "Result",
      data: {
        name: result.name,
        nameType: typeof result.name,
        age: result.age,
        ageType: typeof result.age,
        subscribe: result.subscribe,
        subscribeType: typeof result.subscribe,
        plan: result.plan,
        planType: typeof result.plan,
      },
    });
  },
});

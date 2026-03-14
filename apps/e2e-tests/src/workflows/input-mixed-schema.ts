import { createWorkflow } from "relay-sdk";

/**
 * Tests a schema with all four field types in a single form.
 * Verifies each field returns the correct type.
 */
export const inputMixedSchema = createWorkflow({
  name: "Input Mixed Schema",
  handler: async ({ input, output }) => {
    const result = await input("Fill out the form", {
      name: {
        type: "text",
        label: "Name",
        placeholder: "Jane Doe",
        required: true,
      },
      age: {
        type: "number",
        label: "Age",
        placeholder: "25",
      },
      subscribe: {
        type: "checkbox",
        label: "Subscribe to updates",
        description: "We'll send you occasional emails",
      },
      plan: {
        type: "select",
        label: "Plan",
        options: [
          { value: "free", label: "Free" },
          { value: "pro", label: "Pro" },
          { value: "enterprise", label: "Enterprise" },
        ],
      },
    });
    await output.metadata({
      title: "Result",
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

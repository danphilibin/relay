import { createWorkflow } from "@/sdk/workflow";

export const survey = createWorkflow({
  name: "Survey Demo",
  handler: async ({ input, output }) => {
    // Simple prompt → string
    const name = await input("What's your name?");
    await output(`Hey ${name}!`);

    // Prompt with buttons → { value, $choice }
    const { $choice } = await input("Want to continue?", {
      buttons: ["Let's go!", "No thanks"],
    });

    if ($choice === "No thanks") {
      await output("No worries, come back anytime!");
      return;
    }

    // Schema → typed object
    const profile = await input("Tell us about yourself", {
      role: { type: "text", label: "What's your role?" },
      experience: {
        type: "select",
        label: "Years of experience",
        options: [
          { value: "0-2", label: "0-2 years" },
          { value: "3-5", label: "3-5 years" },
          { value: "5+", label: "5+ years" },
        ],
      },
    });

    await output(
      `Got it — you're a ${profile.role} with ${profile.experience} experience.`,
    );

    // Schema with buttons
    const feedback = await input(
      "One last thing",
      {
        comments: { type: "text", label: "Any feedback for us?" },
      },
      {
        buttons: [
          { label: "Submit", intent: "primary" },
          { label: "Skip", intent: "secondary" },
        ],
      },
    );

    if (feedback.$choice === "Skip") {
      await output("Thanks for participating!");
    } else {
      await output(`Thanks for the feedback: "${feedback.comments}"`);
    }
  },
});

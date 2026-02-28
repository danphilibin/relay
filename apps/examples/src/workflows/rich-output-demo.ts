import { createWorkflow } from "relay-sdk";

export const richOutputDemo = createWorkflow({
  name: "Rich Output Demo",
  description: "Demonstrates all rich output block types.",
  handler: async ({ output }) => {
    await output.markdown("Rich output demo started.");

    await output.markdown(
      "# Rich Output Demo\nAll text output is sent as `output.markdown`.",
    );

    await output.table({
      title: "Sample table",
      data: [
        { name: "Ada Lovelace", role: "Mathematician", status: "active" },
        { name: "Grace Hopper", role: "Computer Scientist", status: "active" },
        { name: "Alan Turing", role: "Researcher", status: "archived" },
      ],
    });

    await output.code({
      language: "bash",
      code: "pnpm dev\npnpm build",
    });

    await output.image({
      src: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1200&q=80",
      alt: "Laptop and code on a desk",
    });

    await output.link({
      url: "https://developers.cloudflare.com/workflows/",
      title: "Cloudflare Workflows Docs",
      description: "Reference docs for workflow patterns and APIs.",
    });

    await output.buttons([
      {
        label: "Open Cloudflare",
        url: "https://cloudflare.com",
        intent: "primary",
      },
      {
        label: "View GitHub",
        url: "https://github.com/cloudflare",
        intent: "secondary",
      },
      {
        label: "Danger Example",
        intent: "danger",
      },
    ]);

    await output.markdown("Rich output demo complete.");
  },
});

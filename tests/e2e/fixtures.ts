import { test as base, expect } from "@playwright/test";

/**
 * Navigates to a workflow route, which auto-creates a run
 * and connects to the stream via useWorkflowStream.
 */
async function openWorkflow(
  page: import("@playwright/test").Page,
  workflowSlug: string,
) {
  await page.goto(`/${workflowSlug}`);
}

export const test = base.extend<{
  openWorkflow: (slug: string) => Promise<void>;
}>({
  openWorkflow: async ({ page }, use) => {
    await use((slug: string) => openWorkflow(page, slug));
  },
});

export { expect };

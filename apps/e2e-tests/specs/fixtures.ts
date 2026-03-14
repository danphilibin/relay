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

/**
 * Helper to read a metadata value from the Result metadata block.
 * Looks for a <dt> with the key text and returns the sibling <dd> text.
 */
export async function getMetadataValue(
  page: import("@playwright/test").Page,
  key: string,
): Promise<string> {
  // Use exact text matching to avoid "name" matching "nameType"
  const dt = page.locator("dt", { hasText: new RegExp(`^${key}$`) });
  const dd = dt.locator("+ dd");
  return (await dd.textContent()) ?? "";
}

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
  continueWorkflow: (label?: string) => Promise<void>;
}>({
  openWorkflow: async ({ page }, use) => {
    await use((slug: string) => openWorkflow(page, slug));
  },
  // Clicks the first enabled button matching the label (default "Continue").
  // This avoids ambiguity in multi-step workflows where previous steps
  // leave behind disabled buttons with the same label.
  continueWorkflow: async ({ page }, use) => {
    await use(async (label = "Continue") => {
      const button = page
        .getByRole("button", { name: new RegExp(label, "i") })
        .and(page.locator(":not([disabled])"));
      await button.click();
    });
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
  // Use .last() to target the most recent metadata block (previous steps persist on page)
  const dt = page.locator("dt", { hasText: new RegExp(`^${key}$`) }).last();
  const dd = dt.locator("+ dd");
  return (await dd.textContent()) ?? "";
}

import { test, expect } from "./fixtures";

test.describe("loading()", () => {
  test("shows loading text then completion message", async ({
    page,
    openWorkflow,
  }) => {
    await openWorkflow("loading-flow");

    // The loading message should appear
    await expect(page.getByText("Processing data...")).toBeVisible();

    // After the callback completes, the completion message replaces or follows it
    await expect(page.getByText("Data processed!")).toBeVisible();

    // The final output.markdown confirms the workflow finished
    await expect(page.getByText("Loading complete.")).toBeVisible();
  });
});

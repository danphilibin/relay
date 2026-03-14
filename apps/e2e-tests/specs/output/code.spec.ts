import { test, expect } from "../fixtures";

test.describe("output.code()", () => {
  test("renders code content", async ({ page, openWorkflow }) => {
    await openWorkflow("output-code");

    // The code block should contain the function source
    await expect(page.getByText("function greet")).toBeVisible();
    await expect(page.getByText("Hello,")).toBeVisible();
  });
});

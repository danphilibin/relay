import { test, expect } from "../fixtures";

test.describe("output.link()", () => {
  test("renders title, description, and URL", async ({
    page,
    openWorkflow,
  }) => {
    await openWorkflow("output-link");

    await expect(page.getByText("Example Site")).toBeVisible();
    await expect(page.getByText("A link to an example website")).toBeVisible();

    const link = page.getByRole("link", { name: /example\.com/ });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "https://example.com");
  });
});

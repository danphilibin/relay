import { test, expect } from "../fixtures";

test.describe("output.buttons()", () => {
  test("renders all buttons with correct labels", async ({
    page,
    openWorkflow,
  }) => {
    await openWorkflow("output-buttons");

    await expect(page.getByText("Primary Action")).toBeVisible();
    await expect(page.getByText("Secondary Action")).toBeVisible();
    await expect(page.getByText("Danger Action")).toBeVisible();
    await expect(page.getByText("Link Button")).toBeVisible();
  });

  test("link button has correct href", async ({ page, openWorkflow }) => {
    await openWorkflow("output-buttons");

    const linkButton = page.getByRole("link", { name: "Link Button" });
    await expect(linkButton).toBeVisible();
    await expect(linkButton).toHaveAttribute("href", "https://example.com");
  });
});

import { test, expect } from "../fixtures";

test.describe("output.markdown()", () => {
  test("renders heading, bold text, inline code, and list", async ({
    page,
    openWorkflow,
  }) => {
    await openWorkflow("output-markdown");

    // Heading
    await expect(
      page.getByRole("heading", { name: "Test Heading" }),
    ).toBeVisible();

    // Bold text and inline code
    await expect(page.getByText("bold")).toBeVisible();
    await expect(page.getByText("inline code")).toBeVisible();

    // List items
    await expect(page.getByText("Item one")).toBeVisible();
    await expect(page.getByText("Item two")).toBeVisible();
    await expect(page.getByText("Item three")).toBeVisible();
  });
});

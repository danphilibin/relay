import { test, expect } from "../fixtures";

test.describe("output.image()", () => {
  test("renders image with alt text", async ({ page, openWorkflow }) => {
    await openWorkflow("output-image");

    const img = page.getByRole("img", { name: "Test image" });
    await expect(img).toBeVisible();
    await expect(img).toHaveAttribute("src", /data:image\/png/);
  });
});

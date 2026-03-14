import { test, expect, getMetadataValue } from "../fixtures";

test.describe("input() — simple text", () => {
  test("returns the entered string", async ({ page, openWorkflow }) => {
    await openWorkflow("input-text");

    await expect(page.getByText("Enter your name")).toBeVisible();
    await page.getByRole("textbox").first().fill("Alice");
    await page.getByRole("button", { name: /continue/i }).click();

    // The workflow echoes back value + typeof via output.metadata
    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "value")).toBe("Alice");
    expect(await getMetadataValue(page, "type")).toBe("string");
  });

  test("handles empty string submission", async ({ page, openWorkflow }) => {
    await openWorkflow("input-text");

    await expect(page.getByText("Enter your name")).toBeVisible();
    // Submit without filling — empty string
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "type")).toBe("string");
  });

  test("handles special characters", async ({ page, openWorkflow }) => {
    await openWorkflow("input-text");

    await expect(page.getByText("Enter your name")).toBeVisible();
    await page.getByRole("textbox").first().fill('O\'Brien & "Co" <LLC>');
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "value")).toBe('O\'Brien & "Co" <LLC>');
  });
});

import { test, expect, getMetadataValue } from "../fixtures";

test.describe("input() — checkbox field", () => {
  test("returns true when checked", async ({ page, openWorkflow }) => {
    await openWorkflow("input-checkbox");

    await expect(page.getByText("Toggle the checkbox")).toBeVisible();

    const checkbox = page.getByRole("checkbox", {
      name: "I agree to the terms",
    });
    await expect(checkbox).toBeVisible();
    await checkbox.check();
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "value")).toBe("true");
    expect(await getMetadataValue(page, "type")).toBe("boolean");
  });

  test("returns false when unchecked", async ({ page, openWorkflow }) => {
    await openWorkflow("input-checkbox");

    await expect(page.getByText("Toggle the checkbox")).toBeVisible();
    // Don't check — default is false
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "value")).toBe("false");
    expect(await getMetadataValue(page, "type")).toBe("boolean");
  });

  test("renders description text", async ({ page, openWorkflow }) => {
    await openWorkflow("input-checkbox");

    await expect(page.getByText("You must agree to continue")).toBeVisible();
  });
});

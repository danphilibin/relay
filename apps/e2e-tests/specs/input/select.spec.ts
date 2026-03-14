import { test, expect, getMetadataValue } from "../fixtures";

test.describe("input() — select field", () => {
  test("returns the selected option value", async ({ page, openWorkflow }) => {
    await openWorkflow("input-select");

    await expect(page.getByText("Pick a color")).toBeVisible();

    // Open the select dropdown and pick "Green"
    const select = page.getByRole("combobox", { name: "Favorite color" });
    await expect(select).toBeVisible();
    await select.click();
    await page.getByRole("option", { name: "Green" }).click();
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "value")).toBe("green");
    expect(await getMetadataValue(page, "type")).toBe("string");
  });

  test("defaults to the first option", async ({ page, openWorkflow }) => {
    await openWorkflow("input-select");

    await expect(page.getByText("Pick a color")).toBeVisible();
    // Submit without changing the select — should default to first option
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "value")).toBe("red");
  });

  test("renders description text", async ({ page, openWorkflow }) => {
    await openWorkflow("input-select");

    await expect(page.getByText("Choose one")).toBeVisible();
  });
});

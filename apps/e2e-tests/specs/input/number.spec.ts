import { test, expect, getMetadataValue } from "../fixtures";

test.describe("input() — number field", () => {
  test("returns a number type", async ({ page, openWorkflow }) => {
    await openWorkflow("input-number");

    await expect(page.getByText("Enter a number")).toBeVisible();

    const numberInput = page.getByRole("spinbutton", { name: "Quantity" });
    await expect(numberInput).toBeVisible();
    await numberInput.fill("42");
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "value")).toBe("42");
    expect(await getMetadataValue(page, "type")).toBe("number");
  });

  test("renders description and placeholder", async ({
    page,
    openWorkflow,
  }) => {
    await openWorkflow("input-number");

    await expect(page.getByText("How many items?")).toBeVisible();
    const numberInput = page.getByRole("spinbutton", { name: "Quantity" });
    await expect(numberInput).toHaveAttribute("placeholder", "10");
  });

  test("defaults to 0 when empty", async ({ page, openWorkflow }) => {
    await openWorkflow("input-number");

    await expect(page.getByText("Enter a number")).toBeVisible();
    // Clear the field and submit without entering a value
    const numberInput = page.getByRole("spinbutton", { name: "Quantity" });
    await numberInput.clear();
    await page.getByRole("button", { name: /continue/i }).click();

    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "value")).toBe("0");
    expect(await getMetadataValue(page, "type")).toBe("number");
  });
});

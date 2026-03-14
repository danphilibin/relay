import { test, expect, getMetadataValue } from "../fixtures";

test.describe("input() — mixed schema with all field types", () => {
  test("returns correctly typed values for all field types", async ({
    page,
    openWorkflow,
  }) => {
    await openWorkflow("input-mixed-schema");

    await expect(page.getByText("Fill out the form")).toBeVisible();

    // Fill text field
    await page.getByRole("textbox", { name: "Name" }).fill("Jane Doe");

    // Fill number field
    const numberInput = page.getByRole("spinbutton", { name: "Age" });
    await numberInput.clear();
    await numberInput.fill("30");

    // Check the checkbox
    await page.getByRole("checkbox", { name: "Subscribe to updates" }).check();

    // Select "Pro" plan
    await page.getByRole("combobox", { name: "Plan" }).click();
    await page.getByRole("option", { name: "Pro" }).click();

    await page.getByRole("button", { name: /continue/i }).click();

    // Verify all values and their types
    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "name")).toBe("Jane Doe");
    expect(await getMetadataValue(page, "nameType")).toBe("string");
    expect(await getMetadataValue(page, "age")).toBe("30");
    expect(await getMetadataValue(page, "ageType")).toBe("number");
    expect(await getMetadataValue(page, "subscribe")).toBe("true");
    expect(await getMetadataValue(page, "subscribeType")).toBe("boolean");
    expect(await getMetadataValue(page, "plan")).toBe("pro");
    expect(await getMetadataValue(page, "planType")).toBe("string");
  });

  test("form fields disable after submission", async ({
    page,
    openWorkflow,
  }) => {
    await openWorkflow("input-mixed-schema");

    await expect(page.getByText("Fill out the form")).toBeVisible();
    await page.getByRole("textbox", { name: "Name" }).fill("Test");
    await page.getByRole("button", { name: /continue/i }).click();

    // After submission, fields should be disabled
    await expect(page.getByText("Result")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Name" })).toBeDisabled();
    await expect(page.getByRole("spinbutton", { name: "Age" })).toBeDisabled();
    await expect(
      page.getByRole("checkbox", { name: "Subscribe to updates" }),
    ).toBeDisabled();
  });
});

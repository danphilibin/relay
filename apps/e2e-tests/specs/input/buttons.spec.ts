import { test, expect, getMetadataValue } from "../fixtures";

test.describe("input() — with custom buttons", () => {
  test("returns value and $choice when clicking Save", async ({
    page,
    openWorkflow,
  }) => {
    await openWorkflow("input-buttons");

    await expect(page.getByText("Enter a message")).toBeVisible();
    await page.getByRole("textbox").first().fill("My message");

    // The workflow defines buttons: ["Save", { label: "Discard", intent: "danger" }]
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "value")).toBe("My message");
    expect(await getMetadataValue(page, "choice")).toBe("Save");
  });

  test("returns $choice when clicking Discard", async ({
    page,
    openWorkflow,
  }) => {
    await openWorkflow("input-buttons");

    await expect(page.getByText("Enter a message")).toBeVisible();
    await page.getByRole("textbox").first().fill("Draft text");
    await page.getByRole("button", { name: "Discard" }).click();

    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "value")).toBe("Draft text");
    expect(await getMetadataValue(page, "choice")).toBe("Discard");
  });

  test("renders both button labels", async ({ page, openWorkflow }) => {
    await openWorkflow("input-buttons");

    await expect(page.getByText("Enter a message")).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Discard" })).toBeVisible();
  });
});

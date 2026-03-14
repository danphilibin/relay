import { test, expect, getMetadataValue } from "../fixtures";

test.describe("input() — schema with custom buttons", () => {
  test("returns typed fields and $choice on Approve", async ({
    page,
    openWorkflow,
  }) => {
    await openWorkflow("input-schema-buttons");

    await expect(page.getByText("Review the entry")).toBeVisible();
    await page.getByRole("textbox", { name: "Note" }).fill("Looks good");
    await page.getByRole("button", { name: "Approve" }).click();

    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "note")).toBe("Looks good");
    expect(await getMetadataValue(page, "noteType")).toBe("string");
    expect(await getMetadataValue(page, "choice")).toBe("Approve");
  });

  test("returns $choice on Reject", async ({ page, openWorkflow }) => {
    await openWorkflow("input-schema-buttons");

    await expect(page.getByText("Review the entry")).toBeVisible();
    await page.getByRole("textbox", { name: "Note" }).fill("Needs changes");
    await page.getByRole("button", { name: "Reject" }).click();

    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "note")).toBe("Needs changes");
    expect(await getMetadataValue(page, "choice")).toBe("Reject");
  });
});

import { test, expect, getMetadataValue } from "./fixtures";

test.describe("confirm()", () => {
  test("returns true when approved", async ({ page, openWorkflow }) => {
    await openWorkflow("confirm-flow");

    // Confirmation prompt should appear
    await expect(page.getByText("Do you approve this action?")).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Reject" })).toBeVisible();

    await page.getByRole("button", { name: "Approve" }).click();

    // Should show "Approved" state on the confirm card
    await expect(page.getByText("Approved", { exact: true })).toBeVisible();

    // Workflow outputs the result
    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "approved")).toBe("true");
    expect(await getMetadataValue(page, "type")).toBe("boolean");
  });

  test("returns false when rejected", async ({ page, openWorkflow }) => {
    await openWorkflow("confirm-flow");

    await expect(page.getByText("Do you approve this action?")).toBeVisible();

    await page.getByRole("button", { name: "Reject" }).click();

    // Should show "Rejected" state on the confirm card
    await expect(page.getByText("Rejected")).toBeVisible();

    await expect(page.getByText("Result")).toBeVisible();
    expect(await getMetadataValue(page, "approved")).toBe("false");
    expect(await getMetadataValue(page, "type")).toBe("boolean");
  });
});

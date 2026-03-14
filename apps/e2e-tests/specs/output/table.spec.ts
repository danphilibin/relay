import { test, expect } from "../fixtures";

test.describe("output.table()", () => {
  test("renders title, headers, and data rows", async ({
    page,
    openWorkflow,
  }) => {
    await openWorkflow("output-table");

    // Title
    await expect(page.getByText("Users")).toBeVisible();

    // Table structure
    const table = page.getByRole("table");
    await expect(table).toBeVisible();

    // Column headers
    await expect(
      page.getByRole("columnheader", { name: "Name" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Role" }),
    ).toBeVisible();
    await expect(
      page.getByRole("columnheader", { name: "Status" }),
    ).toBeVisible();

    // Data cells
    await expect(page.getByRole("cell", { name: "Alice" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Admin" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Bob" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Inactive" })).toBeVisible();
  });
});

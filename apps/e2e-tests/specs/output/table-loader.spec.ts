import { test, expect } from "../fixtures";

test.describe("output.table() — loader", () => {
  test("renders title and first page of data", async ({
    page,
    openWorkflow,
  }) => {
    await openWorkflow("output-table-loader");

    await expect(page.getByText("Planets")).toBeVisible();

    const table = page.getByRole("table");
    await expect(table).toBeVisible();

    // First page (pageSize 3): Mercury, Venus, Earth
    await expect(page.getByRole("cell", { name: "Mercury" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Venus" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Earth" })).toBeVisible();

    // Mars should not be on page 1
    await expect(page.getByRole("cell", { name: "Mars" })).not.toBeVisible();
  });

  test("paginates to the next page", async ({ page, openWorkflow }) => {
    await openWorkflow("output-table-loader");

    await expect(page.getByRole("cell", { name: "Mercury" })).toBeVisible();

    // Click next — use first() since toolbar appears above and below the table
    await page.getByRole("button", { name: "Next" }).first().click();

    // Second page: Mars, Jupiter, Saturn
    await expect(page.getByRole("cell", { name: "Mars" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Jupiter" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Saturn" })).toBeVisible();

    // Mercury should no longer be visible
    await expect(page.getByRole("cell", { name: "Mercury" })).not.toBeVisible();
  });

  test("filters results via search", async ({ page, openWorkflow }) => {
    await openWorkflow("output-table-loader");

    await expect(page.getByRole("cell", { name: "Mercury" })).toBeVisible();

    // Search for "giant" — should show Gas giant and Ice giant planets
    await page.getByPlaceholder("Search...").first().fill("giant");

    // Wait for debounce + fetch
    await expect(page.getByRole("cell", { name: "Jupiter" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Saturn" })).toBeVisible();

    // Terrestrial planets should be gone
    await expect(page.getByRole("cell", { name: "Mercury" })).not.toBeVisible();
  });
});

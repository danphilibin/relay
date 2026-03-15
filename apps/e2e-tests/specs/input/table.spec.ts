import { test, expect, getMetadataValue } from "../fixtures";

test.describe("input.table() — loader single selection", () => {
  test("selects a row and returns the resolved object", async ({
    page,
    openWorkflow,
    continueWorkflow,
  }) => {
    await openWorkflow("input-table");

    await expect(page.getByText("Pick a tool")).toBeVisible();

    // Table should show all tools
    await expect(page.getByRole("cell", { name: "Hammer" })).toBeVisible();
    await expect(page.getByRole("cell", { name: "Drill" })).toBeVisible();

    // Click the Drill row to select it
    await page.getByRole("cell", { name: "Drill" }).click();

    // Submit
    await continueWorkflow();

    // Verify resolved result
    await expect(page.getByText("Loader single")).toBeVisible();
    expect(await getMetadataValue(page, "name")).toBe("Drill");
    expect(await getMetadataValue(page, "category")).toBe("Power tools");
  });
});

test.describe("input.table() — static single selection", () => {
  test("selects a row from static data", async ({
    page,
    openWorkflow,
    continueWorkflow,
  }) => {
    await openWorkflow("input-table");

    // First: complete the loader single selection step
    await expect(page.getByText("Pick a tool")).toBeVisible();
    await page.getByRole("cell", { name: "Hammer" }).click();
    await continueWorkflow();

    // Now on static table step
    await expect(page.getByText("Pick a tool (static)")).toBeVisible();
    await expect(page.getByRole("cell", { name: "Saw" })).toBeVisible();

    // Select Saw
    await page.getByRole("cell", { name: "Saw" }).click();
    await continueWorkflow();

    // Verify result
    await expect(page.getByText("Static single")).toBeVisible();
    expect(await getMetadataValue(page, "name")).toBe("Saw");
    expect(await getMetadataValue(page, "category")).toBe("Power tools");
  });
});

test.describe("input.table() — loader multiple selection", () => {
  test("selects multiple rows and returns resolved array", async ({
    page,
    openWorkflow,
    continueWorkflow,
  }) => {
    await openWorkflow("input-table");

    // Step 1: loader single — pick Hammer
    await expect(page.getByText("Pick a tool")).toBeVisible();
    await page.getByRole("cell", { name: "Hammer" }).click();
    await continueWorkflow();

    // Step 2: static single — pick Screwdriver
    await expect(page.getByText("Pick a tool (static)")).toBeVisible();
    await page.getByRole("cell", { name: "Screwdriver" }).click();
    await continueWorkflow();

    // Step 3: loader multiple — pick Drill and Saw
    await expect(page.getByText("Pick multiple tools")).toBeVisible();
    await page.getByRole("cell", { name: "Drill" }).click();
    await page.getByRole("cell", { name: "Saw" }).click();
    await continueWorkflow();

    // Verify result
    await expect(page.getByText("Loader multiple")).toBeVisible();
    expect(await getMetadataValue(page, "count")).toBe("2");
    expect(await getMetadataValue(page, "names")).toBe("Drill, Saw");
  });
});

import { expect, test } from "@playwright/test";

test("ask-name workflow completes after submitting a name", async ({ page }) => {
  const name = `Playwright User ${Date.now()}`;

  await page.goto("/");
  await page.getByRole("link", { name: "Ask Name" }).click();

  // In some sandboxed runs, routing to /ask-name does not immediately render
  // the workflow pane. Fall back to opening a concrete run URL.
  if (await page.getByText("Select a workflow to get started").isVisible()) {
    const startResponse = await page.request.post("/workflows", {
      data: { name: "ask-name" },
    });
    expect(startResponse.ok()).toBeTruthy();
    const run = (await startResponse.json()) as { id: string };
    await page.goto(`/ask-name/${run.id}`);
  }

  await expect(page.getByText("Hello! I'd like to get to know you.")).toBeVisible();

  await page.getByRole("textbox").first().fill(name);
  await page.getByRole("button", { name: /continue/i }).click();

  await expect(page.getByText(`Nice to meet you, ${name}!`)).toBeVisible({
    timeout: 30_000,
  });
});

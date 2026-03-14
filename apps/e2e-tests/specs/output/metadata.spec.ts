import { test, expect, getMetadataValue } from "../fixtures";

test.describe("output.metadata()", () => {
  test("renders title and all key-value pairs", async ({
    page,
    openWorkflow,
  }) => {
    await openWorkflow("output-metadata");

    // Title
    await expect(page.getByText("Order Summary")).toBeVisible();

    // String value
    expect(await getMetadataValue(page, "Order ID")).toBe("ORD-12345");

    // Number value (rendered as string in the DOM)
    expect(await getMetadataValue(page, "Amount")).toBe("99.99");

    // Boolean value
    expect(await getMetadataValue(page, "Shipped")).toBe("true");
  });
});

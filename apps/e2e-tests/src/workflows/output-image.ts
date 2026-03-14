import { createWorkflow } from "relay-sdk";

/**
 * Tests output.image() with src and alt text.
 * Uses a data URI to avoid external dependencies in tests.
 */
export const outputImage = createWorkflow({
  name: "Output Image",
  handler: async ({ output }) => {
    // 1x1 red PNG as a data URI — no external fetch needed
    await output.image({
      src: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==",
      alt: "Test image",
    });
  },
});

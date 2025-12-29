import { createWorkflow } from "../src/sdk/types";

export const processFiles = createWorkflow(async ({ step, relay }) => {
  await relay.output("Workflow started");

  const files = await step.do("fetch files", async () => {
    await relay.output("Fetching files from API...");
    const files = [
      "doc_7392_rev3.pdf",
      "report_x29_final.pdf",
      "memo_2024_05_12.pdf",
      "file_089_update.pdf",
      "proj_alpha_v2.pdf",
      "data_analysis_q2.pdf",
      "notes_meeting_52.pdf",
      "summary_fy24_draft.pdf",
    ];
    await relay.output(`Found ${files.length} files`);
    return files;
  });

  await step.sleep("pause", "3 seconds");
  await relay.output("Starting file processing...");

  for (let i = 0; i < files.length; i++) {
    await step.do(`process file ${i}`, async () => {
      await relay.output(`Processing ${files[i]}...`);
      await new Promise((resolve) => setTimeout(resolve, 500));
      await relay.output(`✓ Completed ${files[i]}`);
    });
  }

  await relay.output("Workflow completed successfully!");
});

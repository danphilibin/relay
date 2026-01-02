import type { RelayContext } from "../src/sdk/workflow";

export const processFiles = async ({ step, output }: RelayContext) => {
  await output("Workflow started");
  await output("Fetching files from API...");

  const files = await step.do("fetch files", async () => {
    return [
      "doc_7392_rev3.pdf",
      "report_x29_final.pdf",
      "memo_2024_05_12.pdf",
      "file_089_update.pdf",
      "proj_alpha_v2.pdf",
      "data_analysis_q2.pdf",
      "notes_meeting_52.pdf",
      "summary_fy24_draft.pdf",
    ];
  });

  await output(`Found ${files.length} files`);
  await step.sleep("pause", "3 seconds");
  await output("Starting file processing...");

  for (let i = 0; i < files.length; i++) {
    await step.do(`process file ${i}`, async () => {
      // Simulate processing time
      await new Promise((resolve) => setTimeout(resolve, 500));
    });
    await output(`Processing ${files[i]}...`);
    await output(`✓ Completed ${files[i]}`);
  }

  await output("Workflow completed successfully!");
};

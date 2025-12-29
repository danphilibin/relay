import { fetchHackernews } from "../workflows/fetch-hackernews";
import { processFiles } from "../workflows/process-files";
import { askName } from "../workflows/ask-name";
import { WorkflowRegistry } from "./sdk/types";

export const workflows: WorkflowRegistry = {
  "fetch-hackernews": fetchHackernews,
  "process-files": processFiles,
  "ask-name": askName,
};

export function getWorkflowTypes(): string[] {
  return Object.keys(workflows);
}

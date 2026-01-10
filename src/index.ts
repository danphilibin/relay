import { RelayDurableObject } from "./sdk/cf-durable-object";
import { RelayWorkflow } from "./sdk/cf-workflow";
import { httpHandler } from "./sdk/cf-http";

// Required Cloudflare worker exports
export { RelayDurableObject, RelayWorkflow };
export default { fetch: httpHandler };

// Import workflows to trigger self-registration
import "@/workflows/fetch-hacker-news";
import "@/workflows/process-files";
import "@/workflows/ask-name";
import "@/workflows/newsletter-signup";
import "@/workflows/survey";

import { RelayDurableObject, RelayWorkflow, httpHandler } from "relay-sdk";

// Required Cloudflare worker exports
export { RelayDurableObject, RelayWorkflow };
export default { fetch: httpHandler };

// Import workflows to trigger self-registration
import "./workflows/fetch-hacker-news";
import "./workflows/ask-name";
import "./workflows/newsletter-signup";
import "./workflows/survey";
import "./workflows/approval-test";
import "./workflows/refund";
import "./workflows/rich-output-demo";

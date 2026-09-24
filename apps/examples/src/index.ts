import { RelayExecutor, RelayMcpAgent, httpHandler } from "@relay-tools/sdk";

// Required Cloudflare worker exports
export { RelayExecutor, RelayMcpAgent };

export default { fetch: httpHandler };

// Import workflows to trigger self-registration
import "./workflows/fetch-hacker-news";
import "./workflows/ask-name";
import "./workflows/newsletter-signup";
import "./workflows/process-refund";
import "./workflows/create-webhook";
import "./workflows/users";
import "./workflows/tables";

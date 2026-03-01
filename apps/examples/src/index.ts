import {
  RelayDurableObject,
  RelayWorkflow,
  RelayMcpAgent,
  httpHandler,
} from "relay-sdk";

// Required Cloudflare worker exports
export { RelayDurableObject, RelayWorkflow, RelayMcpAgent };

export default {
  fetch: (req: Request, env: Env, ctx: ExecutionContext) => {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/mcp")) {
      return RelayMcpAgent.serve("/mcp", { binding: "RELAY_MCP_AGENT" }).fetch(req, env, ctx);
    }
    return httpHandler(req, env);
  },
};

// Import workflows to trigger self-registration
import "./workflows/fetch-hacker-news";
import "./workflows/ask-name";
import "./workflows/newsletter-signup";
import "./workflows/survey";
import "./workflows/approval-test";
import "./workflows/refund";
import "./workflows/rich-output-demo";

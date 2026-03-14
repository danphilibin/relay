import {
  RelayDurableObject,
  RelayWorkflow,
  RelayMcpAgent,
  httpHandler,
} from "relay-sdk";

// Required Cloudflare worker exports
export { RelayDurableObject, RelayWorkflow, RelayMcpAgent };

export default { fetch: httpHandler };

// Import workflows to trigger self-registration
// -- Input primitives --
import "./workflows/input-text";
import "./workflows/input-number";
import "./workflows/input-checkbox";
import "./workflows/input-select";
import "./workflows/input-mixed-schema";
import "./workflows/input-buttons";
import "./workflows/input-schema-buttons";
// -- Output primitives --
import "./workflows/output-markdown";
import "./workflows/output-table";
import "./workflows/output-code";
import "./workflows/output-image";
import "./workflows/output-link";
import "./workflows/output-buttons";
import "./workflows/output-metadata";
// -- Other primitives --
import "./workflows/confirm-flow";
import "./workflows/loading-flow";

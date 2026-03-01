/**
 * Environment bindings expected by the Relay SDK.
 * Users provide these via their wrangler.jsonc configuration.
 */
interface Env {
  RELAY_WORKFLOW: Workflow;
  RELAY_DURABLE_OBJECT: DurableObjectNamespace;
  RELAY_APP_URL: string;
}

// Extend the wrangler-generated Env with optional config vars
// set via `wrangler secret put` (not declared in wrangler.jsonc).
interface Env {
  RELAY_APP_URL: string;
}

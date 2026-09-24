#!/bin/bash
set -e

BRANCH=$(git branch --show-current)

# Public URL of the web app. The worker uses this (as RELAY_APP_URL) to put
# browser links to in-progress runs in MCP responses, so it should be the
# address people actually visit — the custom domain, not the workers.dev URL.
# There's only one web app (always deployed as `relay-web`, even from a
# branch), so this is the same for every deploy. Override with APP_URL=...
APP_URL="${APP_URL:-https://relay-demo.philib.in}"

if [ "$BRANCH" = "main" ]; then
  WORKER_NAME="relay-tools"
else
  # Sanitize branch name for use as a worker name (alphanumeric and hyphens only)
  WORKER_NAME="relay-tools-$(echo "$BRANCH" | sed 's/[^a-zA-Z0-9]/-/g')"
fi

# Deploy worker first so we can capture its URL
echo "Deploying worker as '$WORKER_NAME'..."

DEPLOY_OUTPUT=$(pnpm --filter relay-examples exec wrangler deploy --name "$WORKER_NAME" 2>&1)

echo "$DEPLOY_OUTPUT"

# Extract the worker URL from wrangler's output
WORKER_URL=$(echo "$DEPLOY_OUTPUT" | grep -oE 'https://[^ ]+\.workers\.dev' | head -1)

if [ -z "$WORKER_URL" ]; then
  echo "Error: Could not extract worker URL from deploy output"
  exit 1
fi

echo ""
echo "Worker deployed at: $WORKER_URL"
echo ""

# Set the worker URL as a Cloudflare secret for the web app, then deploy.
# The web app proxies API requests to this URL at runtime (not baked into the build).
echo "$WORKER_URL" | pnpm --filter @relay-tools/web exec wrangler secret put RELAY_WORKER_URL
pnpm --filter @relay-tools/web run deploy

# Point the worker at the web app so MCP responses link to the right place.
# Set on every deploy so a fresh (e.g. branch) worker never falls back to a
# stale or missing value.
echo ""
echo "Setting RELAY_APP_URL on '$WORKER_NAME' to $APP_URL"
echo "$APP_URL" | pnpm --filter relay-examples exec wrangler secret put RELAY_APP_URL --name "$WORKER_NAME"

#!/bin/bash
set -e

BRANCH=$(git branch --show-current)

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

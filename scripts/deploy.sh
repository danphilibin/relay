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
echo "Building web with VITE_RELAY_WORKER_URL=$WORKER_URL"
echo ""

# Build and deploy web app — the env var overrides .env.production
VITE_RELAY_WORKER_URL="$WORKER_URL" pnpm --filter relay-web run deploy

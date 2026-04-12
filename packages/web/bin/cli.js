#!/usr/bin/env node

// ── Deprecation notice ──────────────────────────────────────────
// relay-web has been replaced by @relay-tools/cli. Print a notice
// for every invocation so users know to migrate.
console.warn(
  "\x1b[33m" +
    "⚠ relay-web is deprecated. Use @relay-tools/cli instead:\n" +
    "    npx @relay-tools/cli dev\n" +
    "    npx @relay-tools/cli create my-project\n" +
    "\x1b[0m",
);

import cac from "cac";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { writeFileSync, rmSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");
const distServer = resolve(packageRoot, "dist", "server");
const require = createRequire(import.meta.url);

const pkg = JSON.parse(
  readFileSync(resolve(packageRoot, "package.json"), "utf-8"),
);

// Resolve Wrangler through Node package resolution so the CLI does not depend
// on a specific package manager's node_modules/.bin layout.
const wrangler = require.resolve("wrangler/bin/wrangler.js");

// ── Helpers ──────────────────────────────────────────────────────

/**
 * Generate a minimal wrangler config. Paths are relative to dist/server/
 * (where the config file is written) so wrangler can resolve module
 * imports from the server bundle with no_bundle: true.
 */
function generateConfig({ name, vars }) {
  return {
    name,
    main: "index.js",
    assets: { directory: "../client" },
    compatibility_date: "2025-09-02",
    compatibility_flags: ["nodejs_compat"],
    no_bundle: true,
    rules: [{ type: "ESModule", globs: ["**/*.js", "**/*.mjs"] }],
    ...(vars && Object.keys(vars).length > 0 ? { vars } : {}),
  };
}

/** Write config to dist/server/ (next to the entry) and return the path. */
function writeTempConfig(config) {
  const id = randomBytes(4).toString("hex");
  const configPath = join(distServer, `.relay-cli-${id}.json`);
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

/** Run a command, forwarding stdio. Cleans up the temp config on exit. */
function run(command, args, configPath) {
  let result;
  try {
    result = spawnSync(command, args, { stdio: "inherit" });
  } finally {
    try {
      rmSync(configPath, { force: true });
    } catch {}
  }

  if (result.error) {
    throw result.error;
  }

  if (result.signal) {
    throw new Error(`Command terminated by signal ${result.signal}`);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

// ── CLI ──────────────────────────────────────────────────────────

const cli = cac("relay-web");

cli
  .command("dev", "Start the Relay web UI locally")
  .option("--port <port>", "Port to listen on", { default: "5173" })
  .option("--worker-url <url>", "Relay worker backend URL", {
    default: "http://localhost:8787",
  })
  .action(({ port, workerUrl }) => {
    const config = generateConfig({
      name: "relay-web-dev",
      vars: { RELAY_WORKER_URL: workerUrl },
    });
    const configPath = writeTempConfig(config);
    run(
      process.execPath,
      [wrangler, "dev", "--config", configPath, "--port", String(port)],
      configPath,
    );
  });

cli
  .command("deploy", "Deploy the Relay web UI to Cloudflare")
  .option("--name <name>", "Cloudflare Worker name", { default: "relay-web" })
  .action(({ name }) => {
    const config = generateConfig({ name });
    const configPath = writeTempConfig(config);
    run(
      process.execPath,
      [wrangler, "deploy", "--config", configPath],
      configPath,
    );
    console.log("");
    console.log("Set the worker URL (if not already configured):");
    console.log(`  npx wrangler secret put RELAY_WORKER_URL --name ${name}`);
  });

cli.help();
cli.version(pkg.version);
cli.parse();

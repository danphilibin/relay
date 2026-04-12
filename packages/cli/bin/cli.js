#!/usr/bin/env node

import cac from "cac";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import {
  writeFileSync,
  rmSync,
  mkdirSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(__dirname, "..");
const require = createRequire(import.meta.url);

const pkg = JSON.parse(
  readFileSync(resolve(packageRoot, "package.json"), "utf-8"),
);

// Resolve wrangler through Node package resolution so we don't depend on a
// specific package manager's node_modules/.bin layout.
const wranglerBin = require.resolve("wrangler/bin/wrangler.js");

// ── Template strings ───────────────────────────────────────────
// Embedded project templates — keeps the package simple with no file-copy logic.

function templatePackageJson(name) {
  return JSON.stringify(
    {
      name,
      version: "0.0.0",
      private: true,
      type: "module",
      scripts: {
        dev: "npx @relay-tools/cli dev",
        typecheck: "wrangler types && tsc",
      },
      dependencies: {
        "@relay-tools/sdk": "latest",
      },
      devDependencies: {
        typescript: "^5.9.2",
        wrangler: "^4.77.0",
      },
    },
    null,
    2,
  );
}

const templateWranglerJsonc = (name) =>
  `\
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": ${JSON.stringify(name)},
  "main": "src/index.ts",
  "compatibility_date": "2025-12-21",
  "compatibility_flags": ["nodejs_compat"],
  "durable_objects": {
    "bindings": [
      {
        "name": "RELAY_EXECUTOR",
        "class_name": "RelayExecutor"
      },
      {
        "name": "RELAY_MCP_AGENT",
        "class_name": "RelayMcpAgent"
      }
    ]
  },
  "migrations": [
    {
      "tag": "v1",
      "new_sqlite_classes": ["RelayExecutor", "RelayMcpAgent"]
    }
  ]
}
`;

const templateTsconfig = `\
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "noEmit": true,
    "isolatedModules": true,
    "esModuleInterop": true,
    "allowSyntheticDefaultImports": true,
    "forceConsistentCasingInFileNames": true,
    "strict": true,
    "skipLibCheck": true,
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*"]
}
`;

const templateIndexTs = `\
import { RelayExecutor, RelayMcpAgent, httpHandler } from "@relay-tools/sdk";

// Required Cloudflare worker exports — wrangler needs these to bind
// the Durable Object classes declared in wrangler.jsonc.
export { RelayExecutor, RelayMcpAgent };

export default { fetch: httpHandler };

// Import workflows to trigger self-registration
import "./workflows/hello-world";
`;

const templateHelloWorldTs = `\
import { createWorkflow } from "@relay-tools/sdk";

export const helloWorld = createWorkflow({
  name: "Hello World",
  handler: async ({ input, output }) => {
    await output.markdown("Hello! Welcome to Relay.");
    const name = await input.text("What's your name?");
    await output.markdown(\`Nice to meet you, \${name}! Your first workflow is up and running.\`);
  },
});
`;

// ── Helpers ─────────────────────────────────────────────────────

/**
 * Resolve the pre-built web UI dist path from @relay-tools/web.
 * Works whether the package is installed via npm or linked in a monorepo.
 */
function resolveWebDistServer() {
  const webPkgPath = require.resolve("@relay-tools/web/package.json");
  return resolve(dirname(webPkgPath), "dist", "server");
}

/**
 * Generate a minimal wrangler config for the web UI. Paths are relative to
 * dist/server/ (where the config file is written) so wrangler can resolve
 * module imports from the server bundle with no_bundle: true.
 */
function generateWebConfig({ name, vars }) {
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
function writeTempConfig(distServer, config) {
  const id = randomBytes(4).toString("hex");
  const configPath = join(distServer, `.relay-cli-${id}.json`);
  writeFileSync(configPath, JSON.stringify(config, null, 2));
  return configPath;
}

/**
 * Spawn a labeled child process. Output is prefixed with a colored label
 * so the user can tell which process produced which line.
 */
function spawnLabeled(label, color, command, args, options = {}) {
  const colorCodes = {
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
  };
  const reset = "\x1b[0m";
  const prefix = `${colorCodes[color] || ""}[${label}]${reset} `;

  const child = spawn(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    ...options,
  });

  // Prefix each line of stdout/stderr with the label
  function prefixStream(stream, target) {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      // Keep the last partial line in the buffer
      buffer = lines.pop();
      for (const line of lines) {
        target.write(`${prefix}${line}\n`);
      }
    });
    stream.on("end", () => {
      if (buffer.length > 0) {
        target.write(`${prefix}${buffer}\n`);
      }
    });
  }

  prefixStream(child.stdout, process.stdout);
  prefixStream(child.stderr, process.stderr);

  return child;
}

/**
 * Check if the current directory looks like a Relay worker project
 * (has wrangler.jsonc or wrangler.json).
 */
function findWranglerConfig(dir) {
  for (const name of ["wrangler.jsonc", "wrangler.json", "wrangler.toml"]) {
    const p = join(dir, name);
    if (existsSync(p)) return p;
  }
  return null;
}

// ── CLI ─────────────────────────────────────────────────────────

const cli = cac("relay");

// ── create ──────────────────────────────────────────────────────

cli
  .command("create <directory>", "Scaffold a new Relay worker project")
  .action((directory) => {
    const targetDir = resolve(process.cwd(), directory);

    if (existsSync(targetDir)) {
      console.error(`Error: directory "${directory}" already exists.`);
      process.exit(1);
    }

    // Scaffold the project directory
    mkdirSync(join(targetDir, "src", "workflows"), { recursive: true });

    const projectName = directory.replace(/[^a-zA-Z0-9-]/g, "-");

    writeFileSync(
      join(targetDir, "package.json"),
      templatePackageJson(projectName),
    );
    writeFileSync(
      join(targetDir, "wrangler.jsonc"),
      templateWranglerJsonc(projectName),
    );
    writeFileSync(join(targetDir, "tsconfig.json"), templateTsconfig);
    writeFileSync(join(targetDir, "src", "index.ts"), templateIndexTs);
    writeFileSync(
      join(targetDir, "src", "workflows", "hello-world.ts"),
      templateHelloWorldTs,
    );

    console.log("");
    console.log(`Created ${directory}/`);
    console.log("");
    console.log("  cd " + directory);
    console.log("  npm install");
    console.log("  npx @relay-tools/cli dev");
    console.log("");
  });

// ── dev ─────────────────────────────────────────────────────────

cli
  .command("dev", "Start the Relay web UI and worker for local development")
  .option("--port <port>", "Web UI port", { default: "5173" })
  .option("--worker-port <port>", "Worker port", { default: "8787" })
  .option(
    "--worker-url <url>",
    "Use an existing worker instead of starting one",
  )
  .action(({ port, workerPort, workerUrl }) => {
    const cwd = process.cwd();
    const wranglerConfig = findWranglerConfig(cwd);
    const hasWorkerProject = wranglerConfig !== null;

    // If --worker-url is provided, skip starting the worker process
    const skipWorkerStart = !!workerUrl;
    const effectiveWorkerUrl = workerUrl || `http://localhost:${workerPort}`;

    // ── Start worker (if applicable) ──
    const children = [];

    if (hasWorkerProject && !skipWorkerStart) {
      const workerArgs = [wranglerBin, "dev", "--port", String(workerPort)];
      // Point to the specific config file we found
      if (wranglerConfig) {
        workerArgs.push("--config", wranglerConfig);
      }
      const workerChild = spawnLabeled(
        "worker",
        "blue",
        process.execPath,
        workerArgs,
        { cwd },
      );
      children.push(workerChild);
    } else if (!hasWorkerProject) {
      console.log(
        "No wrangler config found in current directory — starting web UI only.",
      );
      console.log(
        'Run "npx @relay-tools/cli create my-project" to scaffold a worker project.\n',
      );
    }

    // ── Start web UI ──
    const distServer = resolveWebDistServer();
    const webConfig = generateWebConfig({
      name: "relay-web-dev",
      vars: { RELAY_WORKER_URL: effectiveWorkerUrl },
    });
    const configPath = writeTempConfig(distServer, webConfig);

    const webChild = spawnLabeled("web", "magenta", process.execPath, [
      wranglerBin,
      "dev",
      "--config",
      configPath,
      "--port",
      String(port),
    ]);
    children.push(webChild);

    // ── Cleanup on exit ──
    function cleanup() {
      try {
        rmSync(configPath, { force: true });
      } catch {
        // ignore
      }
      for (const child of children) {
        // Negative PID sends signal to the process group on Unix
        try {
          child.kill("SIGTERM");
        } catch {
          // ignore
        }
      }
    }

    process.on("SIGINT", () => {
      cleanup();
      process.exit(0);
    });
    process.on("SIGTERM", () => {
      cleanup();
      process.exit(0);
    });

    // If any child exits unexpectedly, shut everything down
    for (const child of children) {
      child.on("close", (code) => {
        if (code !== 0 && code !== null) {
          console.error(`\nProcess exited with code ${code}. Shutting down...`);
          cleanup();
          process.exit(code);
        }
      });
    }
  });

cli.help();
cli.version(pkg.version);
cli.parse();

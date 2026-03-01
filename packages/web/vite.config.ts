import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  
  if (command === "build" && mode === "production" && !env.VITE_RELAY_WORKER_URL) {
    throw new Error(
      "VITE_RELAY_WORKER_URL is required for production builds.\n" +
        "Set it in packages/web/.env or pass it inline:\n" +
        "  VITE_RELAY_WORKER_URL=https://relay-tools.your-subdomain.workers.dev pnpm --filter relay-web build",
    );
  }

  return {
  plugins: [
    tailwindcss(),
    reactRouter(),
    tsconfigPaths({
      skip: (dir) => dir.includes("opensrc"),
    }),
  ],
  server: {
    proxy: {
      "/api": "http://localhost:8787",
      "/stream": "http://localhost:8787",
      "/workflows": "http://localhost:8787",
    },
  },
  build: {
    reportCompressedSize: false,
  },
  logLevel: command === "build" ? "warn" : "info",
};
});

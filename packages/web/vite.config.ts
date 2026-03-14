import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => {
  // Allow overriding the worker URL for e2e tests (e.g., port 8788)
  const workerUrl = process.env.RELAY_WORKER_URL ?? "http://localhost:8787";

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
        "/api": workerUrl,
        "/stream": workerUrl,
        "/workflows": workerUrl,
      },
    },
    build: {
      reportCompressedSize: false,
    },
    logLevel: command === "build" ? "warn" : "info",
  };
});

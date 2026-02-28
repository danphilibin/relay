import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => ({
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
}));

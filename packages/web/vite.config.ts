import { cloudflare } from "@cloudflare/vite-plugin";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import tailwindcss from "@tailwindcss/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => {
  return {
    plugins: [
      cloudflare({ viteEnvironment: { name: "ssr" } }),
      tanstackStart(),
      tailwindcss(),
      viteReact(),
      tsconfigPaths({
        skip: (dir) => dir.includes("opensrc"),
      }),
    ],
    build: {
      reportCompressedSize: false,
    },
    logLevel: command === "build" ? "warn" : "info",
  };
});

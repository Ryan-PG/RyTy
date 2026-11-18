import { defineConfig } from "vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss(), cloudflare()],
  resolve: {
    alias: [
      {
        find: "@ryty/shared",
        replacement: path.resolve(__dirname, "shared/src/index.ts"),
      },
      {
        find: "@",
        replacement: path.resolve(__dirname, "frontend/src"),
      },
    ],
  },
  build: {
    sourcemap: false,
  },
});

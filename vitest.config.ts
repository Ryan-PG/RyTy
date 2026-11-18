import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@ryty/shared": path.resolve(__dirname, "shared/src/index.ts"),
    },
  },
  test: {
    include: ["backend/tests/**/*.test.ts"],
    environment: "node",
    // Each test file gets its own process; the libsql native driver is happy there.
    pool: "forks",
    testTimeout: 20000,
  },
});

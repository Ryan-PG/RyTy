// Bundles the Node/Docker server (shared app + node runtime) into a single
// self-contained ESM file. Native/database drivers stay external so they can
// be installed as normal runtime dependencies in the container.
import { build } from "esbuild";
import { mkdirSync } from "node:fs";

mkdirSync("dist/server", { recursive: true });

await build({
  entryPoints: ["backend/src/runtime/node.ts"],
  outfile: "dist/server/server.mjs",
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  minify: false,
  // Keep native and runtime-critical packages external.
  external: [
    "@libsql/client",
    "@hono/node-server",
    "@hono/node-server/serve-static",
    "hono",
    "hono/*",
  ],
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
});

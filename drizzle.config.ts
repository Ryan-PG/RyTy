import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./backend/src/database/schema.ts",
  out: "./migrations",
});

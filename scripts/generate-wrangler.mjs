import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../", import.meta.url));

const templatePath = path.join(rootDir, "wrangler.example.jsonc");
const outputPath = path.join(rootDir, "wrangler.jsonc");

const databaseId = process.env.D1_DATABASE_ID?.trim();

if (!databaseId) {
  throw new Error("D1_DATABASE_ID environment variable is missing.");
}

if (
  !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    databaseId,
  )
) {
  throw new Error("D1_DATABASE_ID is not a valid UUID.");
}

const template = await readFile(templatePath, "utf8");

const placeholder = "REPLACE_WITH_YOUR_D1_DATABASE_ID";

if (!template.includes(placeholder)) {
  throw new Error(
    `Placeholder "${placeholder}" was not found in the Wrangler template.`,
  );
}

const config = template.replace(placeholder, databaseId);

await writeFile(outputPath, config, "utf8");

console.log("Generated wrangler.jsonc successfully.");

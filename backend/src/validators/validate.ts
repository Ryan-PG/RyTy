import { z } from "zod";
import { badRequest } from "../utils/http";

/** Parse a JSON body with a zod schema; throws a 400 with field details. */
export async function parseJson<T extends z.ZodType>(c: import("hono").Context, schema: T): Promise<z.output<T>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw badRequest("invalid_json", "Request body must be valid JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_";
      (details[key] ??= []).push(issue.message);
    }
    throw badRequest("validation_error", "Invalid request data", details);
  }
  return result.data;
}

/** Parse query params with a zod schema; throws a 400 with field details. */
export function parseQuery<T extends z.ZodType>(c: import("hono").Context, schema: T): z.output<T> {
  const raw = Object.fromEntries(new URL(c.req.url).searchParams.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_";
      (details[key] ??= []).push(issue.message);
    }
    throw badRequest("validation_error", "Invalid query parameters", details);
  }
  return result.data;
}

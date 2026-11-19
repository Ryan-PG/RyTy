import { Hono } from "hono";
import { z } from "zod";
import { tagListQuerySchema } from "@ryty/shared";
import { parseJson, parseQuery } from "../validators/validate";
import { normalizeTagName } from "../repositories/tags";

/**
 * Tag routes. All tags are public: everyone can list, autocomplete and
 * create them. POST is idempotent by (case-insensitive) name.
 */
export function tagRoutes(): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const services = c.get("services");
    const query = parseQuery(c, tagListQuerySchema);
    return c.json({ data: await services.tags.search(query.q) });
  });

  app.post("/", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const body = await parseJson(c, z.object({ name: z.string().trim().min(1).max(40) }));
    const name = normalizeTagName(body.name);
    if (!name) {
      return c.json(
        { error: { code: "validation_error", message: "Tag name is required" } },
        400,
      );
    }
    const tag = await services.tags.ensureMany([name], user.id);
    return c.json({ data: tag[0] ?? null }, 201);
  });

  return app;
}

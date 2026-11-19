import { Hono } from "hono";
import { createProjectSchema, updateProjectSchema } from "@ryty/shared";
import { parseJson } from "../validators/validate";
import {
  approveProject,
  createProject,
  deleteProject,
  listProjects,
  rejectProject,
  updateProject,
} from "../services/project";

/**
 * Project routes. Public + active projects are visible to everyone;
 * private and suggested ones only to their creator; admins manage all.
 */
export function projectRoutes(): Hono {
  const app = new Hono();

  app.get("/", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    return c.json({ data: await listProjects(services, user) });
  });

  app.post("/", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const body = await parseJson(c, createProjectSchema);
    const project = await createProject(services, user, body);
    return c.json({ data: project }, 201);
  });

  app.patch("/:id", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const body = await parseJson(c, updateProjectSchema);
    const project = await updateProject(services, user, id, body);
    return c.json({ data: project });
  });

  app.delete("/:id", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    await deleteProject(services, user, id);
    return c.json({ data: { ok: true } });
  });

  // Admin review of suggested projects.
  app.post("/:id/approve", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const project = await approveProject(services, user, id);
    return c.json({ data: project });
  });

  app.post("/:id/reject", async (c) => {
    const services = c.get("services");
    const user = c.get("user");
    const id = Number(c.req.param("id"));
    const project = await rejectProject(services, user, id);
    return c.json({ data: project });
  });

  return app;
}

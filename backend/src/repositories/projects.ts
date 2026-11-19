import { and, asc, eq, or, sql } from "drizzle-orm";
import { projects, users } from "../database/schema";
import type { AppDatabase } from "../database/adapter";
import type { Project, ProjectStatus, ProjectVisibility } from "@ryty/shared";

type ProjectRow = typeof projects.$inferSelect;

export interface ProjectActor {
  id: number;
  role: string;
}

function toProject(row: ProjectRow, creatorUsername?: string | null): Project {
  const project: Project = {
    id: row.id,
    name: row.name,
    description: row.description,
    visibility: row.visibility as ProjectVisibility,
    status: row.status as ProjectStatus,
    createdBy: row.createdBy,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
  if (creatorUsername) project.creatorUsername = creatorUsername;
  return project;
}

export interface CreateProjectInput {
  name: string;
  description: string | null;
  visibility: ProjectVisibility;
  status: ProjectStatus;
  createdBy: number;
}

export interface UpdateProjectPatch {
  name?: string;
  description?: string | null;
  visibility?: ProjectVisibility;
  status?: ProjectStatus;
}

export function createProjectRepository(db: AppDatabase) {
  return {
    /** Projects the actor can see/use: public active + their own. Admins see all. */
    async listForActor(actor: ProjectActor): Promise<Project[]> {
      const conditions =
        actor.role === "admin"
          ? []
          : [
              or(
                and(eq(projects.visibility, "public"), eq(projects.status, "active")),
                eq(projects.createdBy, actor.id),
              )!,
            ];
      const rows = await db
        .select({ project: projects, creator: users.username })
        .from(projects)
        .leftJoin(users, eq(users.id, projects.createdBy))
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(asc(projects.name));
      return rows.map((r) => toProject(r.project, r.creator));
    },

    async findById(id: number): Promise<Project | null> {
      const [row] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
      return row ? toProject(row) : null;
    },

    async findByIdWithCreator(id: number): Promise<Project | null> {
      const [row] = await db
        .select({ project: projects, creator: users.username })
        .from(projects)
        .leftJoin(users, eq(users.id, projects.createdBy))
        .where(eq(projects.id, id))
        .limit(1);
      return row ? toProject(row.project, row.creator) : null;
    },

    async existsByName(name: string, excludeId?: number): Promise<boolean> {
      const conditions = [sql`lower(${projects.name}) = lower(${name})`];
      if (excludeId !== undefined) conditions.push(sql`${projects.id} <> ${excludeId}`);
      const [row] = await db
        .select({ value: sql<number>`count(*)` })
        .from(projects)
        .where(and(...conditions));
      return Number(row?.value ?? 0) > 0;
    },

    async create(input: CreateProjectInput): Promise<Project> {
      const now = new Date().toISOString();
      const [row] = await db
        .insert(projects)
        .values({
          name: input.name,
          description: input.description,
          visibility: input.visibility,
          status: input.status,
          createdBy: input.createdBy,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return toProject(row);
    },

    async update(id: number, patch: UpdateProjectPatch): Promise<Project | null> {
      const values: Partial<ProjectRow> = { updatedAt: new Date().toISOString() };
      if (patch.name !== undefined) values.name = patch.name;
      if (patch.description !== undefined) values.description = patch.description;
      if (patch.visibility !== undefined) values.visibility = patch.visibility;
      if (patch.status !== undefined) values.status = patch.status;
      const [row] = await db.update(projects).set(values).where(eq(projects.id, id)).returning();
      return row ? toProject(row) : null;
    },

    async delete(id: number): Promise<void> {
      await db.delete(projects).where(eq(projects.id, id));
    },
  };
}

export type ProjectRepository = ReturnType<typeof createProjectRepository>;

import type { Project } from "@ryty/shared";
import { PROJECT_STATUS, PROJECT_VISIBILITY } from "@ryty/shared";
import type { AuthenticatedUser } from "../auth/session";
import type { Services } from "./services";
import { badRequest, conflict, forbidden, notFound } from "../utils/http";
import type { Tag } from "@ryty/shared";
import { normalizeTagName } from "../repositories/tags";

/**
 * Project access rules:
 * - Public + active projects are usable by every signed-in user.
 * - Private and suggested projects are usable only by their creator (and
 *   admins, who can also see and manage everything).
 * - Non-admin users create private projects for themselves, or suggest a
 *   project (status "suggested") for admin review; approval makes it public,
 *   rejection turns it back into the creator's private project.
 */

export async function getProjectOr404(services: Services, id: number): Promise<Project> {
  const project = await services.projects.findByIdWithCreator(id);
  if (!project) throw notFound("project_not_found", "Project not found");
  return project;
}

export async function canUseProject(
  services: Services,
  user: AuthenticatedUser,
  projectId: number,
): Promise<Project> {
  const project = await getProjectOr404(services, projectId);
  const isOwner = project.createdBy === user.id;
  const isAdmin = user.role === "admin";
  const usable =
    isAdmin ||
    isOwner ||
    (project.visibility === PROJECT_VISIBILITY.PUBLIC && project.status === PROJECT_STATUS.ACTIVE);
  if (!usable) {
    throw forbidden("project_not_accessible", "You do not have access to this project");
  }
  return project;
}

export async function listProjects(services: Services, user: AuthenticatedUser): Promise<Project[]> {
  return services.projects.listForActor({ id: user.id, role: user.role });
}

export async function createProject(
  services: Services,
  user: AuthenticatedUser,
  input: { name: string; description?: string | null; visibility?: string; suggest?: boolean },
): Promise<Project> {
  if (await services.projects.existsByName(input.name)) {
    throw conflict("project_name_taken", "A project with this name already exists");
  }
  const isAdmin = user.role === "admin";
  let visibility: "public" | "private";
  let status: "active" | "suggested";
  if (isAdmin) {
    visibility = input.visibility === "public" ? "public" : "private";
    status = "active";
  } else if (input.suggest) {
    // Suggestion: pending admin review; usable by the creator meanwhile.
    visibility = "private";
    status = "suggested";
  } else {
    // Regular users can only create private projects.
    visibility = "private";
    status = "active";
  }
  return services.projects.create({
    name: input.name,
    description: input.description ?? null,
    visibility,
    status,
    createdBy: user.id,
  });
}

export async function updateProject(
  services: Services,
  user: AuthenticatedUser,
  id: number,
  input: { name?: string; description?: string | null; visibility?: string },
): Promise<Project> {
  const project = await getProjectOr404(services, id);
  const isAdmin = user.role === "admin";
  const isOwner = project.createdBy === user.id;
  if (!isAdmin && !isOwner) {
    throw forbidden("project_not_accessible", "You can only edit your own projects");
  }
  if (input.name !== undefined && (await services.projects.existsByName(input.name, id))) {
    throw conflict("project_name_taken", "A project with this name already exists");
  }
  if (input.visibility !== undefined && !isAdmin) {
    // Only admins can change visibility (that is the public/private switch).
    throw forbidden("admin_required", "Only an administrator can change project visibility");
  }
  return (await services.projects.update(id, {
    name: input.name,
    description: input.description ?? undefined,
    visibility: input.visibility as Project["visibility"] | undefined,
  }))!;
}

export async function deleteProject(
  services: Services,
  user: AuthenticatedUser,
  id: number,
): Promise<void> {
  const project = await getProjectOr404(services, id);
  const isAdmin = user.role === "admin";
  const isOwner = project.createdBy === user.id;
  if (!isAdmin && !isOwner) {
    throw forbidden("project_not_accessible", "You can only delete your own projects");
  }
  await services.projects.delete(id);
}

/** Admin: approve a suggested project → public + active. */
export async function approveProject(
  services: Services,
  user: AuthenticatedUser,
  id: number,
): Promise<Project> {
  if (user.role !== "admin") {
    throw forbidden("admin_required", "Only an administrator can approve projects");
  }
  const project = await getProjectOr404(services, id);
  if (project.status !== PROJECT_STATUS.SUGGESTED) {
    throw badRequest("project_not_suggested", "This project is not awaiting review");
  }
  return (await services.projects.update(id, {
    status: PROJECT_STATUS.ACTIVE,
    visibility: PROJECT_VISIBILITY.PUBLIC,
  }))!;
}

/**
 * Admin: reject a suggested project → keep it as the creator's private
 * project instead of deleting their data.
 */
export async function rejectProject(
  services: Services,
  user: AuthenticatedUser,
  id: number,
): Promise<Project> {
  if (user.role !== "admin") {
    throw forbidden("admin_required", "Only an administrator can reject projects");
  }
  const project = await getProjectOr404(services, id);
  if (project.status !== PROJECT_STATUS.SUGGESTED) {
    throw badRequest("project_not_suggested", "This project is not awaiting review");
  }
  return (await services.projects.update(id, {
    status: PROJECT_STATUS.ACTIVE,
    visibility: PROJECT_VISIBILITY.PRIVATE,
  }))!;
}

/** Attach (creating if needed) tags to an activity. */
export async function attachTags(
  services: Services,
  userId: number,
  activityId: number,
  tagNames: string[] | undefined,
): Promise<Tag[]> {
  if (!tagNames || tagNames.length === 0) return [];
  const tags = await services.tags.ensureMany(tagNames, userId);
  await services.tags.setForActivity(activityId, tags.map((t) => t.id));
  return tags;
}

export { normalizeTagName };

import { and, asc, count, eq, ne } from "drizzle-orm";
import { users } from "../database/schema";
import type { AppDatabase } from "../database/adapter";
import type { Role, User } from "@ryty/shared";

type UserRow = typeof users.$inferSelect;

function toUser(row: UserRow): User {
  return {
    id: row.id,
    username: row.username,
    role: row.role as Role,
    isActive: row.isActive,
    mustChangePassword: row.mustChangePassword,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export interface CreateUserInput {
  username: string;
  passwordHash: string;
  role: Role;
  mustChangePassword?: boolean;
}

export interface UpdateUserPatch {
  username?: string;
  passwordHash?: string;
  role?: Role;
  isActive?: boolean;
  mustChangePassword?: boolean;
  language?: string | null;
  theme?: string | null;
  timezone?: string | null;
}

export function createUserRepository(db: AppDatabase) {
  return {
    async findById(id: number): Promise<User | null> {
      const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
      return row ? toUser(row) : null;
    },

    /** Full row including the password hash — internal use only. */
    async findRowByUsername(username: string) {
      const [row] = await db
        .select()
        .from(users)
        .where(eq(users.username, username.toLowerCase()))
        .limit(1);
      return row ?? null;
    },

    async existsByUsername(username: string, excludeId?: number): Promise<boolean> {
      const conditions = [eq(users.username, username.toLowerCase())];
      if (excludeId !== undefined) conditions.push(ne(users.id, excludeId));
      const [row] = await db
        .select({ value: count() })
        .from(users)
        .where(and(...conditions));
      return (row?.value ?? 0) > 0;
    },

    async list(): Promise<User[]> {
      const rows = await db.select().from(users).orderBy(asc(users.username));
      return rows.map(toUser);
    },

    async create(input: CreateUserInput): Promise<User> {
      const now = new Date().toISOString();
      const [row] = await db
        .insert(users)
        .values({
          username: input.username.toLowerCase(),
          passwordHash: input.passwordHash,
          role: input.role,
          isActive: true,
          mustChangePassword: input.mustChangePassword ?? false,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
      return toUser(row);
    },

    async update(id: number, patch: UpdateUserPatch): Promise<User | null> {
      const values: Partial<UserRow> = { updatedAt: new Date().toISOString() };
      if (patch.username !== undefined) values.username = patch.username.toLowerCase();
      if (patch.passwordHash !== undefined) values.passwordHash = patch.passwordHash;
      if (patch.role !== undefined) values.role = patch.role;
      if (patch.isActive !== undefined) values.isActive = patch.isActive;
      if (patch.mustChangePassword !== undefined) values.mustChangePassword = patch.mustChangePassword;
      if (patch.language !== undefined) values.language = patch.language;
      if (patch.theme !== undefined) values.theme = patch.theme;
      if (patch.timezone !== undefined) values.timezone = patch.timezone;
      const [row] = await db.update(users).set(values).where(eq(users.id, id)).returning();
      return row ? toUser(row) : null;
    },

    /** Number of active administrators, optionally excluding one user. */
    async countActiveAdmins(excludeId?: number): Promise<number> {
      const conditions = [eq(users.role, "admin"), eq(users.isActive, true)];
      if (excludeId !== undefined) conditions.push(ne(users.id, excludeId));
      const [row] = await db
        .select({ value: count() })
        .from(users)
        .where(and(...conditions));
      return row?.value ?? 0;
    },
  };
}

export type UserRepository = ReturnType<typeof createUserRepository>;

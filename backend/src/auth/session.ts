import { eq } from "drizzle-orm";
import { sessions, users } from "../database/schema";
import type { AppDatabase } from "../database/adapter";
import { SESSION_COOKIE_NAME } from "@ryty/shared";

const encoder = new TextEncoder();

/** SHA-256 hex digest of a session token (only the hash is stored). */
export async function hashToken(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(token));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Generate a 32-byte URL-safe session token. */
export function generateSessionToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function parseSessionCookie(request: Request): string | null {
  const header = request.headers.get("Cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === SESSION_COOKIE_NAME) return rest.join("=") || null;
  }
  return null;
}

/** True when the original request was made over HTTPS. */
function isSecureRequest(request: Request): boolean {
  const url = new URL(request.url);
  if (url.protocol === "https:") return true;
  const proto = request.headers.get("x-forwarded-proto");
  return proto === "https";
}

export function sessionCookieHeader(token: string, request: Request): string {
  const flags = [
    `${SESSION_COOKIE_NAME}=${token}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${7 * 24 * 60 * 60}`,
  ];
  if (isSecureRequest(request)) flags.push("Secure");
  return flags.join("; ");
}

export function clearSessionCookieHeader(request: Request): string {
  const flags = [`${SESSION_COOKIE_NAME}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (isSecureRequest(request)) flags.push("Secure");
  return flags.join("; ");
}

/** Authenticated user as resolved from the session cookie. */
export interface AuthenticatedUser {
  id: number;
  username: string;
  role: string;
  isActive: boolean;
  mustChangePassword: boolean;
  language: string | null;
  theme: string | null;
  timezone: string | null;
}

/** Create a session for a user and return the raw token. */
export async function createSessionForUser(
  db: AppDatabase,
  userId: number,
): Promise<string> {
  const token = generateSessionToken();
  const now = new Date();
  await db.insert(sessions).values({
    id: crypto.randomUUID(),
    userId,
    tokenHash: await hashToken(token),
    expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now.toISOString(),
  });
  return token;
}

/** Resolve the authenticated user from a request cookie, or null. */
export async function resolveSessionUser(
  db: AppDatabase,
  request: Request,
): Promise<AuthenticatedUser | null> {
  const token = parseSessionCookie(request);
  if (!token) return null;
  const tokenHash = await hashToken(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(eq(sessions.tokenHash, tokenHash))
    .limit(1);
  if (!row) return null;
  if (Date.parse(row.session.expiresAt) < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, row.session.id));
    return null;
  }
  if (!row.user.isActive) return null;
  const user = row.user;
  return {
    id: user.id,
    username: user.username,
    role: user.role,
    isActive: user.isActive,
    mustChangePassword: user.mustChangePassword,
    language: user.language,
    theme: user.theme,
    timezone: user.timezone,
  };
}

/** Revoke every session of a user, optionally keeping one. */
export async function revokeAllSessions(
  db: AppDatabase,
  userId: number,
  exceptSessionId?: string,
): Promise<void> {
  const rows = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(eq(sessions.userId, userId));
  const targets = rows
    .map((r) => r.id)
    .filter((id) => id !== exceptSessionId);
  for (const id of targets) {
    await db.delete(sessions).where(eq(sessions.id, id));
  }
}

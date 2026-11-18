import type { Context } from "hono";
import type { AuthenticatedUser } from "../auth/session";
import type { Services } from "./services";

declare module "hono" {
  interface ContextVariableMap {
    services: Services;
    user: AuthenticatedUser;
  }
}

/** Request client IP (Cloudflare edge header first, proxy header, then "unknown"). */
export function requestIp(c: Context): string {
  const cf = c.req.header("cf-connecting-ip");
  if (cf) return cf.trim();
  const fwd = c.req.header("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return "unknown";
}

/** Origin of the incoming request (scheme://host), when derivable. */
export function requestOrigin(c: Context): string {
  const url = new URL(c.req.url);
  const forwardedHost = c.req.header("x-forwarded-host") ?? c.req.header("host");
  const proto = c.req.header("x-forwarded-proto") ?? url.protocol.replace(":", "");
  return forwardedHost ? `${proto}://${forwardedHost}` : url.origin;
}

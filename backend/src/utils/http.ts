/** HTTP error with API error-envelope semantics. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(code: string, message: string, details?: Record<string, string[]>): HttpError {
  return new HttpError(400, code, message, details);
}

export function notFound(code = "not_found", message = "Resource not found"): HttpError {
  return new HttpError(404, code, message);
}

export function forbidden(code = "forbidden", message = "You are not allowed to perform this action"): HttpError {
  return new HttpError(403, code, message);
}

export function unauthorized(code = "unauthorized", message = "Authentication required"): HttpError {
  return new HttpError(401, code, message);
}

export function conflict(code: string, message: string, details?: Record<string, string[]>): HttpError {
  return new HttpError(409, code, message, details);
}

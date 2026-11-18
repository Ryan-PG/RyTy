export * from "./constants";
export * from "./schemas";
export * from "./types";

/** Standard API success envelope. */
export interface ApiSuccess<T> {
  data: T;
}

/** Standard API error envelope. */
export interface ApiError {
  error: {
    code: string;
    message: string;
    /** Optional field-level details from validation errors. */
    details?: Record<string, string[]>;
  };
}

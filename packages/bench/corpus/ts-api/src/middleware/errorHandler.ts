import { logError } from "./logger.js";

export interface ErrorResponse {
  status: number;
  message: string;
}

export function toErrorResponse(err: unknown): ErrorResponse {
  logError(err);
  const message = err instanceof Error ? err.message : "Internal error";
  const status = message === "Unauthorized" ? 401 : 400;
  return { status, message };
}

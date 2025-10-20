import type { FastifyError } from "fastify";

export class WorkspaceError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly cause?: unknown;
  public override readonly name = "WorkspaceError";

  constructor(statusCode: number, code: string, message: string, cause?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.cause = cause;
  }
}

export function isWorkspaceError(error: unknown): error is WorkspaceError {
  return (
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    "code" in error &&
    (error as WorkspaceError).name === "WorkspaceError"
  );
}
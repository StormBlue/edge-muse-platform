import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiErrorBody, ApiErrorCode } from "../types";

const STATUS_BY_CODE: Record<ApiErrorCode, ContentfulStatusCode> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  QUOTA_EXCEEDED: 402,
  PROVIDER_ERROR: 502,
  PAYLOAD_TOO_LARGE: 413,
  RATE_LIMITED: 429,
  VALIDATION_ERROR: 400,
  NOT_FOUND: 404,
  INTERNAL: 500
};

export class AppError extends HTTPException {
  readonly code: ApiErrorCode;
  readonly details?: unknown;

  constructor(code: ApiErrorCode, message: string, details?: unknown) {
    super(STATUS_BY_CODE[code], { message });
    this.code = code;
    this.details = details;
  }

  toBody(): ApiErrorBody {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details
      }
    };
  }
}

export function appError(code: ApiErrorCode, message: string, details?: unknown): AppError {
  return new AppError(code, message, details);
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

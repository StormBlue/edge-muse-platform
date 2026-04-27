/**
 * 统一业务异常：`AppError` 继承 Hono `HTTPException`，中间件 `installErrorHandling` 序列化为 `ApiErrorBody`。
 * 业务代码应使用 `appError(code, message, details?)` 抛出，避免直接 `return c.json` 散落状态码。
 */
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { ApiErrorBody, ApiErrorCode } from "../types";

/** 各错误码默认 HTTP 状态；与前端 `ApiError` 及监控按 code 聚合一致 */
const STATUS_BY_CODE: Record<ApiErrorCode, ContentfulStatusCode> = {
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
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

  /** @param details 可选结构化信息（如 CONFLICT 时携带 activeGeneration），供前端展示或日志 */
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

/** 工厂函数，便于一行 `throw appError(...)` */
export function appError(code: ApiErrorCode, message: string, details?: unknown): AppError {
  return new AppError(code, message, details);
}

/** 在 `onError` 或路由 catch 中分支：AppError 走 toBody，其它当 500 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

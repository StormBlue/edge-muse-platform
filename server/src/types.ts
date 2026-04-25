import type { Context } from "hono";

export type UserRole = "sysadmin" | "admin" | "user";
export type UserStatus = "active" | "disabled";
export type SessionMode = "text2image" | "image2image" | "chat";
export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export type AuthUser = {
  id: string;
  email: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
};

export type AppBindings = Cloudflare.Env;

export type AppVariables = {
  user: AuthUser;
  traceId: string;
};

export type AppEnv = {
  Bindings: AppBindings;
  Variables: AppVariables;
};

export type AppContext = Context<AppEnv>;

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "QUOTA_EXCEEDED"
  | "PROVIDER_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "INTERNAL";

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

export type ImageAttachment = {
  id: string;
  url: string;
  mime: string;
  width?: number | null;
  height?: number | null;
  byteSize: number;
  prompt?: string | null;
};

export type GenerateParams = {
  prompt: string;
  mode: SessionMode;
  size: string;
  n: number;
  model?: string;
  referenceImageIds?: string[];
};

/**
 * 服务端与 Hono 路由共享的**领域类型**（与 D1 / API 返回体对齐）。
 * Wrangler 注入的 `Cloudflare.Env` 在 `AppBindings` 中展开为 D1、R2、KV、DO 等 binding 类型。
 */
import type { Context } from "hono";

/** 三级角色：系统管理员 / 管理员 / 普通用户（见 docs/archive/开发需求.md §2.1） */
export type UserRole = "sysadmin" | "admin" | "user";
/** 账号是否可用；禁用后 JWT 仍可能有效但 `requireAuth` 会拒 */
export type UserStatus = "active" | "disabled";
/** 会话与生图模式：文生图 / 图生图 */
export type SessionMode = "text2image" | "image2image";
/** 异步任务状态（tasks.status） */
export type TaskStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

/**
 * 注入到 Hono Context 的当前用户（`c.get("user")`）。
 * 由 `middleware/auth` 在验签访问令牌并查 D1 后设置。
 */
export type AuthUser = {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: UserRole;
  status: UserStatus;
  /** 系统管理员可切换默认可用的 provider_key；普通用户用 user_provider_keys 绑定的 key */
  preferredProviderKeyId?: string | null;
};

/** 等价于 `wrangler` 里声明的 `Env`，含 D1、R2、KV、Secrets 等 */
export type AppBindings = Cloudflare.Env;

/**
 * Hono 自定义变量：每个请求在 logger 中写入 `traceId`，
 * 鉴权中间件在通过后写入 `user`。
 */
export type AppVariables = {
  user: AuthUser;
  traceId: string;
};

/** 本项目 Hono 泛型参数：`Env = { Bindings, Variables }` */
export type AppEnv = {
  Bindings: AppBindings;
  Variables: AppVariables;
};

export type AppContext = Context<AppEnv>;

/**
 * 统一业务错误码 → HTTP 状态见 `lib/errors` 中 `STATUS_BY_CODE`。
 * 与前端 `ApiError` 展示及 i18n 文案映射一致。
 */
export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "CONFLICT"
  | "QUOTA_EXCEEDED"
  | "PROVIDER_ERROR"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "INTERNAL";

/** JSON 错误体结构：`{ error: { code, message, details? } }` */
export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
};

/**
 * 消息中嵌入的图片元数据（存 messages.attachments JSON，或 WS `task.image` 推送）。
 * `url` 一般为相对路径 `/api/i/:id`，由浏览器带 Cookie 拉取 R2 流。
 */
export type ImageAttachment = {
  id: string;
  url: string;
  mime: string;
  width?: number | null;
  height?: number | null;
  byteSize: number;
  taskId?: string | null;
  sessionId?: string | null;
  prompt?: string | null;
};

/**
 * 提交生图时的参数快照（会序列化进 tasks.params，重试/审计时解析）。
 */
export type GenerateParams = {
  title?: string;
  prompt: string;
  mode: SessionMode;
  size: string;
  n: number;
  model?: string;
  referenceImageIds?: string[];
};

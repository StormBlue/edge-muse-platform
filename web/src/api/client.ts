/**
 * 浏览器端 API 封装（与 Cloudflare Worker 上 Hono 提供的 /api/* 对话）
 *
 * 鉴权：依赖 httpOnly Cookie（refresh）+ 短时 access（具体策略见 server 中间件）。
 * CSRF：非 GET/HEAD/OPTIONS 请求自动带 Cookie `em_csrf` → 头 `X-CSRF-Token`（与 server csrf 中间件配对）。
 *
 * 401 刷新时序（符号）：
 *   apiFetch → 401
 *     → POST /api/auth/refresh（credentials: include）
 *     → 成功则**重试原请求一次**（retryAuth=false 防止死循环）
 *     → 仍失败则抛 ApiError 由调用方处理（如登出页）
 */
/** 与 server `ApiErrorBody` 对齐，thrown 对象由调用方 catch 展示 toast */
export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

/**
 * @param path 以 `/` 开头、**不含** `/api` 前缀，如 `"/me"` → 请求 `GET /api/me`
 * @param retryAuth 401 时是否尝试 refresh 并重试；递归调用时传 `false` 防循环
 */
export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retryAuth = true
): Promise<T> {
  const headers = new Headers(options.headers);
  const method = options.method ?? "GET";
  // multipart 上传不可强设 application/json
  if (!(options.body instanceof FormData) && options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const csrf = getCookie("em_csrf");
  if (csrf && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    headers.set("X-CSRF-Token", csrf);
  }
  // 同站携带 refresh/access Cookie
  const response = await fetch(`/api${path}`, {
    ...options,
    method,
    headers,
    credentials: "include"
  });
  if (response.status === 401 && shouldAttemptAuthRefresh(path, csrf, retryAuth)) {
    const refreshed = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "include"
    });
    if (refreshed.ok) {
      // 用原 options 重放；retryAuth=false 防止 refresh 也 401 时无限递归
      return apiFetch<T>(path, options, false);
    }
  }
  if (!response.ok) {
    const body = (await response.json().catch(() => ({
      error: { code: "INTERNAL", message: response.statusText }
    }))) as ApiError;
    throw body;
  }
  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

/** 读 `document.cookie` 中某键（HTTP-only 的读不到，故 CSRF 用非 httpOnly 的 `em_csrf`） */
export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/** 无 CSRF 时无法发安全 POST，跳过 refresh，避免死循环/无效重试 */
function shouldAttemptAuthRefresh(path: string, csrf: string | null, retryAuth: boolean): boolean {
  if (!retryAuth || !csrf) return false;
  const pathname = path.split("?")[0];
  return pathname !== "/auth/login" && pathname !== "/auth/logout" && pathname !== "/auth/refresh";
}

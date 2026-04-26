export type ApiError = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
  retryAuth = true
): Promise<T> {
  const headers = new Headers(options.headers);
  const method = options.method ?? "GET";
  if (!(options.body instanceof FormData) && options.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const csrf = getCookie("em_csrf");
  if (csrf && !["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) {
    headers.set("X-CSRF-Token", csrf);
  }
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

export function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

function shouldAttemptAuthRefresh(path: string, csrf: string | null, retryAuth: boolean): boolean {
  if (!retryAuth || !csrf) return false;
  const pathname = path.split("?")[0];
  return pathname !== "/auth/login" && pathname !== "/auth/logout" && pathname !== "/auth/refresh";
}

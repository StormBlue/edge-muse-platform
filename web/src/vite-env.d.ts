/// <reference types="vite/client" />

/**
 * 全局 Window 上挂载的 Cloudflare Turnstile 人机验证脚本（登录页通过脚本标签加载）。
 * 非 HTTP-only 的 sitekey 在页内配置；`render` 返回的 widgetId 供 `reset`/`remove` 使用。
 */
interface Window {
  turnstile?: {
    /** 在指定容器内渲染挑战控件，返回供后续复位的 widget 标识 */
    render: (
      container: HTMLElement,
      options: {
        sitekey: string;
        /** 用户通过挑战后回调，token 可随登录请求提交给后端校验 */
        callback: (token: string) => void;
        /** 令牌过期时触发，需 `reset` 后让用户重试 */
        "expired-callback"?: () => void;
        /** 网络/配置错误时回调 */
        "error-callback"?: () => void;
      }
    ) => string;
    reset: (widgetId?: string) => void;
    remove: (widgetId: string) => void;
  };
}

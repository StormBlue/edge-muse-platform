/// <reference types="vite/client" />

import type { DefineComponent } from "vue";
import type { AltchaGlobal } from "altcha/types";

/**
 * 全局 Window 上挂载的 Cloudflare Turnstile 人机验证脚本（登录页通过脚本标签加载）。
 * 非 HTTP-only 的 sitekey 在页内配置；`render` 返回的 widgetId 供 `reset`/`remove` 使用。
 */
declare global {
  var $altcha: AltchaGlobal;

  interface Window {
    turnstile?: {
      /** 在指定容器内渲染挑战控件，返回供后续复位的 widget 标识 */
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          action?: string;
          language?: string;
          size?: "normal" | "compact" | "flexible";
          theme?: "light" | "dark" | "auto";
          retry?: "auto" | "never";
          "refresh-expired"?: "auto" | "manual" | "never";
          "refresh-timeout"?: "auto" | "manual" | "never";
          "response-field"?: boolean;
          /** 用户通过挑战后回调，token 可随登录请求提交给后端校验 */
          callback: (token: string) => void;
          /** 令牌过期时触发，需 `reset` 后让用户重试 */
          "expired-callback"?: () => void;
          /** 网络/配置错误时回调 */
          "error-callback"?: (errorCode?: string) => void;
          /** 交互超时时触发 */
          "timeout-callback"?: () => void;
          /** 当前浏览器不支持 Turnstile 时触发 */
          "unsupported-callback"?: () => void;
        }
      ) => string;
      reset: (widgetId?: string) => void;
      remove: (widgetId: string) => void;
    };
    TencentCaptcha?: new (
      appId: string,
      callback: (response: {
        ret: number;
        ticket?: string;
        randstr?: string;
        errorCode?: string;
        errorMessage?: string;
      }) => void,
      options?: {
        bizState?: string;
        needFeedBack?: boolean;
      }
    ) => {
      show: () => void;
      destroy?: () => void;
    };
  }
}

declare module "vue" {
  export interface GlobalComponents {
    "altcha-widget": DefineComponent<{
      class?: string;
      ref?: unknown;
      challenge?: string;
      onStatechange?: (event: CustomEvent) => void;
      onVerified?: (event: CustomEvent) => void;
    }>;
  }
}

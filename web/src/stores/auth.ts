/**
 * 认证与当前用户/配额（与 GET /api/me、POST /api/auth/login|logout 对齐）
 *
 * - `bootstrap`：应用启动时拉 `/me`；失败则置未登录（Cookie 可能过期或首次访问）。
 * - `persist`：持久化首屏展示所需快照；敏感操作仍以服务端会话为准。
 *
 * 登录时序（符号）：
 *   login() → POST /api/auth/login（可带 Turnstile）→ 服务端 Set-Cookie
 *   → 响应体带 user + quota → 写入本 store
 *
 * 持久化：`persist` 仅减轻白屏闪烁；**权限以服务端 Cookie + /me 为准**，勿仅信 localStorage。
 */
import { defineStore } from "pinia";
import { apiFetch } from "@/api/client";
import type { GenerationEntry } from "@/api/generation";

export type Role = "sysadmin" | "admin" | "user";
export type ProviderCapabilities = {
  providerId: string;
  providerName: string;
  providerKeyId: string;
  requestFormat: string;
  model: string;
  supportedModes: Array<"text2image" | "image2image">;
  supportedSizes: string[];
  maxReferenceImages: number | null;
};
/** 与 GET /api/me 中 user 段一致；勿信任仅存本地持久化的字段作权限边界 */
export type User = {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: Role;
  status: string;
  preferredProviderKeyId?: string | null;
};
/** 剩余额度等；`allocatedQuota` 为 null 表示不限制（仅后端 sysadmin 语义） */
export type Quota = {
  allocatedQuota: number | null;
  usedQuota: number;
  remainingQuota: number | null;
};
export const useAuthStore = defineStore("auth", {
  state: () => ({
    /** 当前用户；未登录为 null */
    user: null as User | null,
    quota: null as Quota | null,
    /** 当前用户实际 provider/key 的能力快照；为空时前端保留通用能力，后端仍会校验 */
    providerCapabilities: null as ProviderCapabilities | null,
    /** 当前用户可见的生成入口；sysadmin 固定同时展示两个入口 */
    generationEntry: null as GenerationEntry | null,
    /** Prompt 助手运维开关；默认 true，真实状态以 /me 响应为准 */
    promptAssistantEnabled: true,
    /** 是否已结束首次 bootstrap（路由守卫依赖，避免未请求就跳登录） */
    loaded: false
  }),
  getters: {
    /** 有 `user` 即视为已登录（仍可能随后 401，以接口为准） */
    isAuthenticated: (state) => Boolean(state.user),
    /** 租户管理 + 系统管理入口；与后端 `requireRole("admin")` 一致（含 sysadmin） */
    isAdmin: (state) => state.user?.role === "admin" || state.user?.role === "sysadmin",
    isSysadmin: (state) => state.user?.role === "sysadmin"
  },
  actions: {
    /** 应用挂载时调用；401/网络错误清状态，但 `loaded=true` 表示「已尝试过」 */
    async bootstrap() {
      try {
        const body = await apiFetch<{
          user: User;
          quota: Quota;
          providerCapabilities: ProviderCapabilities | null;
          generationEntry: GenerationEntry;
          promptAssistantEnabled: boolean;
        }>("/me");
        this.user = body.user;
        this.quota = body.quota;
        this.providerCapabilities = body.providerCapabilities;
        this.generationEntry = body.generationEntry;
        this.promptAssistantEnabled = body.promptAssistantEnabled;
      } catch {
        this.user = null;
        this.quota = null;
        this.providerCapabilities = null;
        this.generationEntry = null;
        this.promptAssistantEnabled = true;
      } finally {
        this.loaded = true;
      }
    },
    /**
     * 账密登录；成功后服务端下发 Cookie，本 store 写入 user/quota
     * @param turnstileToken 登录页 Turnstile 控件产出，可为空时由后端策略拒绝
     */
    async login(email: string, password: string, turnstileToken?: string) {
      const body = await apiFetch<{
        user: User;
        quota: Quota;
        providerCapabilities: ProviderCapabilities | null;
        generationEntry: GenerationEntry;
        promptAssistantEnabled: boolean;
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, turnstileToken })
      });
      this.user = body.user;
      this.quota = body.quota;
      this.providerCapabilities = body.providerCapabilities;
      this.generationEntry = body.generationEntry;
      this.promptAssistantEnabled = body.promptAssistantEnabled;
    },
    /** 调登出接口黑 jti；`.catch` 忽略网络错误仍清本地，避免卡在已删 Cookie 态 */
    async logout() {
      await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
      this.user = null;
      this.quota = null;
      this.providerCapabilities = null;
      this.generationEntry = null;
      this.promptAssistantEnabled = true;
    },
    /** PATCH /api/me 改昵称，成功后覆写 user */
    async updateProfile(nickname: string) {
      const body = await apiFetch<{
        user: User;
        quota: Quota;
        providerCapabilities: ProviderCapabilities | null;
        generationEntry: GenerationEntry;
        promptAssistantEnabled: boolean;
      }>("/me", {
        method: "PATCH",
        body: JSON.stringify({ nickname })
      });
      this.user = body.user;
      this.quota = body.quota;
      this.providerCapabilities = body.providerCapabilities;
      this.generationEntry = body.generationEntry;
      this.promptAssistantEnabled = body.promptAssistantEnabled;
    }
  },
  // 仅持久化展示快照减轻首屏闪烁；真正鉴权和权限边界以 Cookie + 服务端为准
  persist: {
    pick: ["user", "quota", "providerCapabilities", "generationEntry", "promptAssistantEnabled"]
  }
});

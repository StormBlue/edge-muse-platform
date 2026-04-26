import { defineStore } from "pinia";
import { apiFetch } from "@/api/client";

export type Role = "sysadmin" | "admin" | "user";
export type User = {
  id: string;
  email: string;
  username: string;
  nickname: string;
  role: Role;
  status: string;
  preferredProviderKeyId?: string | null;
};
export type Quota = {
  allocatedQuota: number | null;
  usedQuota: number;
  remainingQuota: number | null;
};

export const useAuthStore = defineStore("auth", {
  state: () => ({
    user: null as User | null,
    quota: null as Quota | null,
    loaded: false
  }),
  getters: {
    isAuthenticated: (state) => Boolean(state.user),
    isAdmin: (state) => state.user?.role === "admin" || state.user?.role === "sysadmin",
    isSysadmin: (state) => state.user?.role === "sysadmin"
  },
  actions: {
    async bootstrap() {
      try {
        const body = await apiFetch<{ user: User; quota: Quota }>("/me");
        this.user = body.user;
        this.quota = body.quota;
      } catch {
        this.user = null;
        this.quota = null;
      } finally {
        this.loaded = true;
      }
    },
    async login(email: string, password: string, turnstileToken?: string) {
      const body = await apiFetch<{ user: User; quota: Quota }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, turnstileToken })
      });
      this.user = body.user;
      this.quota = body.quota;
    },
    async logout() {
      await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
      this.user = null;
      this.quota = null;
    },
    async updateProfile(nickname: string) {
      const body = await apiFetch<{ user: User; quota: Quota }>("/me", {
        method: "PATCH",
        body: JSON.stringify({ nickname })
      });
      this.user = body.user;
      this.quota = body.quota;
    }
  },
  persist: {
    pick: ["user", "quota"]
  }
});

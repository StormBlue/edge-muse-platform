<script setup lang="ts">
import { computed } from "vue";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  History,
  Image,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Settings,
  Shield,
  Sun,
  Users
} from "lucide-vue-next";
import { useAuthStore } from "@/stores/auth";
import { useUiStore } from "@/stores/ui";

const auth = useAuthStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();

const quotaLabel = computed(() => {
  if (!auth.quota) return "--";
  if (auth.quota.allocatedQuota === null) return "Unlimited";
  return `${Math.max(auth.quota.allocatedQuota - auth.quota.usedQuota, 0)}/${auth.quota.allocatedQuota}`;
});

const nav = computed(() => [
  { to: "/workspace", label: "工作台", icon: Image, show: true },
  { to: "/history", label: "历史", icon: History, show: true },
  { to: "/admin/users", label: "用户管理", icon: Users, show: auth.isAdmin },
  { to: "/sysadmin/dashboard", label: "系统看板", icon: LayoutDashboard, show: auth.isSysadmin },
  { to: "/sysadmin/providers", label: "服务商", icon: Shield, show: auth.isSysadmin },
  { to: "/sysadmin/keys", label: "密钥", icon: KeyRound, show: auth.isSysadmin }
]);

async function logout() {
  await auth.logout();
  await router.push("/login");
}
</script>

<template>
  <div class="min-h-screen bg-background text-foreground lg:flex">
    <aside
      class="fixed inset-y-0 left-0 z-40 w-72 border-r border-border bg-card transition-transform lg:static lg:translate-x-0"
      :class="ui.sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex h-16 items-center gap-3 border-b border-border px-5">
        <div
          class="flex h-9 w-9 items-center justify-center rounded-xl bg-primary text-sm font-black text-white"
        >
          EM
        </div>
        <div>
          <p class="text-sm font-semibold">Edge Muse</p>
          <p class="text-xs text-muted-foreground">Image operations</p>
        </div>
      </div>
      <nav class="space-y-1 px-3 py-4">
        <RouterLink
          v-for="item in nav.filter((entry) => entry.show)"
          :key="item.to"
          :to="item.to"
          class="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          :class="
            route.path.startsWith(item.to.split('/').slice(0, 3).join('/'))
              ? 'bg-muted text-foreground'
              : ''
          "
        >
          <component :is="item.icon" class="h-4 w-4" />
          {{ item.label }}
        </RouterLink>
      </nav>
      <div class="absolute bottom-0 left-0 right-0 border-t border-border p-4">
        <div class="rounded-xl border border-border bg-background p-3">
          <p class="text-sm font-semibold">{{ auth.user?.nickname }}</p>
          <p class="truncate text-xs text-muted-foreground">{{ auth.user?.email }}</p>
          <div class="mt-3 flex items-center justify-between text-xs">
            <span class="text-muted-foreground">配额</span>
            <span class="font-mono">{{ quotaLabel }}</span>
          </div>
        </div>
      </div>
    </aside>

    <div class="min-w-0 flex-1">
      <header
        class="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur"
      >
        <button
          class="ui-button ui-button-secondary lg:hidden"
          type="button"
          @click="ui.sidebarOpen = !ui.sidebarOpen"
        >
          <Menu class="h-4 w-4" />
        </button>
        <div class="hidden text-sm text-muted-foreground lg:block">
          Create, review, and govern image generation tasks.
        </div>
        <div class="flex items-center gap-2">
          <select
            class="ui-field h-9 w-24 px-2 text-sm"
            :value="ui.locale"
            @change="ui.setLocale(($event.target as HTMLSelectElement).value)"
          >
            <option value="zh-CN">中文</option>
            <option value="en-US">EN</option>
          </select>
          <button
            class="ui-button ui-button-secondary"
            type="button"
            title="Theme"
            @click="ui.setTheme(ui.theme === 'dark' ? 'light' : 'dark')"
          >
            <Sun v-if="ui.theme === 'dark'" class="h-4 w-4" />
            <Moon v-else class="h-4 w-4" />
          </button>
          <RouterLink class="ui-button ui-button-secondary" to="/settings/profile" title="Settings">
            <Settings class="h-4 w-4" />
          </RouterLink>
          <button
            class="ui-button ui-button-secondary"
            type="button"
            title="Logout"
            @click="logout"
          >
            <LogOut class="h-4 w-4" />
          </button>
        </div>
      </header>
      <main class="mx-auto w-full max-w-7xl px-4 py-5 lg:px-6">
        <slot />
      </main>
    </div>
  </div>
</template>

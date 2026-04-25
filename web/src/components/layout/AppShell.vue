<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useI18n } from "vue-i18n";
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
  SunMoon,
  Users
} from "lucide-vue-next";
import BrandMark from "@/components/brand/BrandMark.vue";
import { useAuthStore } from "@/stores/auth";
import { type ThemeMode, useUiStore } from "@/stores/ui";

const auth = useAuthStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const themeMenuOpen = ref(false);
const themeMenuRef = ref<HTMLElement | null>(null);

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

const themeOptions = computed(() => [
  { value: "auto" as ThemeMode, label: t("theme.system"), icon: SunMoon },
  { value: "light" as ThemeMode, label: t("theme.light"), icon: Sun },
  { value: "dark" as ThemeMode, label: t("theme.dark"), icon: Moon }
]);

const currentTheme = computed(
  () => themeOptions.value.find((option) => option.value === ui.theme) ?? themeOptions.value[0]
);

const themeTitle = computed(() => `${t("theme.label")}: ${currentTheme.value.label}`);

function selectTheme(theme: ThemeMode) {
  ui.setTheme(theme);
  themeMenuOpen.value = false;
}

async function logout() {
  await auth.logout();
  await router.push("/login");
}

function closeThemeMenu(event: PointerEvent) {
  if (!themeMenuOpen.value) return;
  if (themeMenuRef.value?.contains(event.target as Node)) return;
  themeMenuOpen.value = false;
}

onMounted(() => document.addEventListener("pointerdown", closeThemeMenu));
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeThemeMenu));
</script>

<template>
  <div class="min-h-screen bg-background text-foreground lg:flex">
    <aside
      class="fixed inset-y-0 left-0 z-40 w-72 border-r border-border bg-card transition-transform lg:static lg:translate-x-0"
      :class="ui.sidebarOpen ? 'translate-x-0' : '-translate-x-full'"
    >
      <div class="flex h-16 items-center gap-3 border-b border-border px-5">
        <BrandMark class="size-9" />
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
          <div ref="themeMenuRef" class="relative">
            <button
              class="ui-button ui-button-secondary ui-icon-button"
              type="button"
              :title="themeTitle"
              :aria-label="themeTitle"
              :aria-expanded="themeMenuOpen"
              aria-haspopup="menu"
              @click="themeMenuOpen = !themeMenuOpen"
              @keydown.esc="themeMenuOpen = false"
            >
              <component :is="currentTheme.icon" class="h-6 w-6" :stroke-width="2.25" />
            </button>
            <div
              v-if="themeMenuOpen"
              class="absolute right-0 z-50 mt-2 w-36 rounded-lg border border-border bg-card p-1 shadow-lg"
              role="menu"
            >
              <button
                v-for="option in themeOptions"
                :key="option.value"
                class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm transition hover:bg-muted"
                :class="option.value === ui.theme ? 'text-foreground' : 'text-muted-foreground'"
                type="button"
                role="menuitemradio"
                :aria-checked="option.value === ui.theme"
                @click="selectTheme(option.value)"
              >
                <component :is="option.icon" class="h-5 w-5" :stroke-width="2.25" />
                <span>{{ option.label }}</span>
              </button>
            </div>
          </div>
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

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  History,
  Image,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Monitor,
  Moon,
  Settings,
  SlidersHorizontal,
  Shield,
  Sun,
  Users
} from "lucide-vue-next";
import BrandMark from "@/components/brand/BrandMark.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAuthStore } from "@/stores/auth";
import { type ThemeMode, useUiStore } from "@/stores/ui";

const auth = useAuthStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const themeMenuOpen = ref(false);
const themeMenuRef = ref<HTMLElement | null>(null);
const isDesktopSidebar = ref(false);
let sidebarModeQuery: MediaQueryList | null = null;
let stopSidebarModeSync: (() => void) | null = null;

const quotaLabel = computed(() => {
  if (!auth.quota) return "--";
  if (auth.quota.allocatedQuota === null) return t("common.unlimited");
  return `${Math.max(auth.quota.allocatedQuota - auth.quota.usedQuota, 0)}/${auth.quota.allocatedQuota}`;
});

const nav = computed(() => [
  { to: "/workspace", label: t("nav.workspace"), icon: Image, show: true },
  { to: "/history", label: t("nav.history"), icon: History, show: true },
  { to: "/admin/users", label: t("nav.admin"), icon: Users, show: auth.isAdmin },
  {
    to: "/sysadmin/dashboard",
    label: t("nav.dashboard"),
    icon: LayoutDashboard,
    show: auth.isSysadmin
  },
  { to: "/sysadmin/providers", label: t("nav.providers"), icon: Shield, show: auth.isSysadmin },
  { to: "/sysadmin/keys", label: t("nav.keys"), icon: KeyRound, show: auth.isSysadmin },
  { to: "/sysadmin/admins", label: t("nav.admins"), icon: Users, show: auth.isSysadmin },
  {
    to: "/sysadmin/users/_/sessions",
    label: t("nav.sessionAudit"),
    icon: MessagesSquare,
    show: auth.isSysadmin
  },
  {
    to: "/sysadmin/preferences",
    label: t("nav.preferences"),
    icon: SlidersHorizontal,
    show: auth.isSysadmin
  }
]);

const visibleNav = computed(() => nav.value.filter((entry) => entry.show));

const themeOptions = computed(() => [
  { value: "auto" as ThemeMode, label: t("theme.system"), icon: Monitor },
  { value: "light" as ThemeMode, label: t("theme.light"), icon: Sun },
  { value: "dark" as ThemeMode, label: t("theme.dark"), icon: Moon }
]);

const currentTheme = computed(
  () => themeOptions.value.find((option) => option.value === ui.theme) ?? themeOptions.value[0]
);

const themeTitle = computed(() => `${t("theme.label")}: ${currentTheme.value.label}`);

const sidebarToggleLabel = computed(() => {
  if (isDesktopSidebar.value) {
    return ui.sidebarCollapsed ? t("shell.expandSidebar") : t("shell.collapseSidebar");
  }
  return ui.sidebarOpen ? t("shell.closeSidebar") : t("shell.openSidebar");
});

const userInitial = computed(() => auth.user?.nickname?.trim().charAt(0).toUpperCase() || "U");

const userSummaryTitle = computed(() =>
  [auth.user?.nickname, auth.user?.email].filter(Boolean).join(" · ")
);

function selectTheme(theme: ThemeMode) {
  ui.setTheme(theme);
  themeMenuOpen.value = false;
}

function isActiveNav(to: string) {
  return route.path.startsWith(to.split("/").slice(0, 3).join("/"));
}

function syncSidebarMode() {
  isDesktopSidebar.value = sidebarModeQuery?.matches ?? false;
  if (isDesktopSidebar.value) ui.closeSidebar();
}

function toggleSidebarNav() {
  if (isDesktopSidebar.value) {
    ui.toggleSidebarCollapsed();
    return;
  }
  ui.toggleSidebar();
}

function closeMobileSidebar() {
  if (!isDesktopSidebar.value) ui.closeSidebar();
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

watch(
  () => route.fullPath,
  () => closeMobileSidebar()
);

onMounted(() => {
  document.addEventListener("pointerdown", closeThemeMenu);
  sidebarModeQuery = window.matchMedia("(min-width: 1024px)");
  syncSidebarMode();
  sidebarModeQuery.addEventListener("change", syncSidebarMode);
  stopSidebarModeSync = () => sidebarModeQuery?.removeEventListener("change", syncSidebarMode);
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeThemeMenu);
  stopSidebarModeSync?.();
});
</script>

<template>
  <div class="h-dvh overflow-hidden bg-background text-foreground lg:flex">
    <button
      v-if="ui.sidebarOpen"
      class="fixed inset-0 z-20 bg-black/45 lg:hidden"
      type="button"
      :aria-label="t('shell.closeSidebar')"
      @click="ui.closeSidebar()"
    />
    <aside
      id="app-sidebar"
      class="fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r border-border bg-card transition-[transform,width] duration-200 ease-out lg:static lg:translate-x-0"
      :class="[
        ui.sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ui.sidebarCollapsed ? 'lg:w-20' : 'lg:w-72'
      ]"
    >
      <div
        class="flex h-16 items-center gap-3 border-b border-border px-5"
        :class="ui.sidebarCollapsed ? 'lg:justify-center lg:px-0' : ''"
      >
        <BrandMark class="size-9 shrink-0" />
        <div class="min-w-0" :class="ui.sidebarCollapsed ? 'lg:hidden' : ''">
          <p class="text-sm font-semibold">Edge Muse</p>
          <p class="text-xs text-muted-foreground">{{ t("shell.subtitle") }}</p>
        </div>
      </div>
      <nav class="flex-1 space-y-1 px-3 py-4">
        <RouterLink
          v-for="item in visibleNav"
          :key="item.to"
          :to="item.to"
          class="flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
          :class="[
            isActiveNav(item.to) ? 'bg-muted text-foreground' : '',
            ui.sidebarCollapsed ? 'lg:justify-center lg:px-0' : ''
          ]"
          :title="item.label"
          :aria-label="item.label"
          @click="closeMobileSidebar"
        >
          <component :is="item.icon" class="h-4 w-4 shrink-0" />
          <span class="truncate" :class="ui.sidebarCollapsed ? 'lg:hidden' : ''">
            {{ item.label }}
          </span>
        </RouterLink>
      </nav>
      <div
        class="border-t border-border p-4"
        :class="ui.sidebarCollapsed ? 'lg:flex lg:justify-center lg:p-3' : ''"
      >
        <div
          class="rounded-xl border border-border bg-background p-3"
          :class="ui.sidebarCollapsed ? 'lg:hidden' : ''"
        >
          <p class="text-sm font-semibold">{{ auth.user?.nickname }}</p>
          <p class="truncate text-xs text-muted-foreground">{{ auth.user?.email }}</p>
          <div class="mt-3 flex items-center justify-between text-xs">
            <span class="text-muted-foreground">{{ t("common.quota") }}</span>
            <span class="font-mono">{{ quotaLabel }}</span>
          </div>
        </div>
        <div
          v-if="ui.sidebarCollapsed"
          class="hidden size-10 items-center justify-center rounded-lg border border-border bg-background text-sm font-semibold lg:flex"
          :title="userSummaryTitle"
          :aria-label="userSummaryTitle"
        >
          {{ userInitial }}
        </div>
      </div>
    </aside>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        class="z-30 flex h-16 shrink-0 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur"
      >
        <button
          class="ui-button ui-button-secondary ui-icon-button"
          type="button"
          aria-controls="app-sidebar"
          :aria-expanded="isDesktopSidebar ? !ui.sidebarCollapsed : ui.sidebarOpen"
          :aria-label="sidebarToggleLabel"
          :title="sidebarToggleLabel"
          @click="toggleSidebarNav"
        >
          <Menu class="h-4 w-4" />
        </button>
        <div class="hidden text-sm text-muted-foreground lg:block">
          {{ t("shell.tagline") }}
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
              <component :is="currentTheme.icon" class="h-5 w-5" :stroke-width="2.25" />
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
                <component :is="option.icon" class="h-4 w-4" :stroke-width="2.25" />
                <span>{{ option.label }}</span>
              </button>
            </div>
          </div>
          <RouterLink
            class="ui-button ui-button-secondary"
            to="/settings/profile"
            :title="t('common.settings')"
          >
            <Settings class="h-4 w-4" />
          </RouterLink>
          <button
            class="ui-button ui-button-secondary"
            type="button"
            :title="t('common.logout')"
            @click="logout"
          >
            <LogOut class="h-4 w-4" />
          </button>
        </div>
      </header>
      <ScrollArea class="min-h-0 flex-1">
        <main class="mx-auto w-full max-w-none px-4 py-4 lg:px-5">
          <slot />
        </main>
      </ScrollArea>
    </div>
  </div>
</template>

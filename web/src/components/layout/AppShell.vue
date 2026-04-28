<script setup lang="ts">
/**
 * 应用壳（需已登录页使用）：
 * - **侧栏**：`lg` 以上固定为宽屏侧栏，可 `sidebarCollapsed` 收图标栏；以下用 `sidebarOpen` + 遮罩抽屉；
 * - **顶栏**：菜单、标语、语言、主题下拉、设置、登出；
 * - **配额**：侧栏底部卡片展示「剩余/总额」或无限；
 * - **路由高亮**：`isActiveNav` 用路径前三段前缀匹配，避免 `/sysadmin/foo` 与子路径全等失败。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { RouterLink, useRoute, useRouter } from "vue-router";
import {
  History,
  Image,
  KeyRound,
  FlaskConical,
  Library,
  LayoutDashboard,
  LogOut,
  Menu,
  MessagesSquare,
  Monitor,
  Moon,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Users
} from "lucide-vue-next";
import BrandMark from "@/components/brand/BrandMark.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trackExperimentEvent } from "@/api/experiments";
import {
  buildGenerationEntryExposureEvents,
  buildGenerationHistoryReturnEvents,
  buildGenerationRouteOpenEvents
} from "@/components/layout/generationExperimentEvents";
import { useAuthStore } from "@/stores/auth";
import { type ThemeMode, useUiStore } from "@/stores/ui";

const auth = useAuthStore();
const ui = useUiStore();
const route = useRoute();
const router = useRouter();
const { t } = useI18n();
const themeMenuOpen = ref(false);
const themeMenuRef = ref<HTMLElement | null>(null);
/** ≥1024px 视为桌面：用折叠侧栏而非抽屉 */
const isDesktopSidebar = ref(false);
let sidebarModeQuery: MediaQueryList | null = null;
let stopSidebarModeSync: (() => void) | null = null;
const exposedGenerationEntries = new Set<string>();
const openedGenerationRoutes = new Set<string>();
const directGenerationRoutes = new Set<string>();
const returnedHistoryRoutes = new Set<string>();

const quotaLabel = computed(() => {
  if (!auth.quota) return "--";
  if (auth.quota.allocatedQuota === null) return t("common.unlimited");
  return `${Math.max(auth.quota.allocatedQuota - auth.quota.usedQuota, 0)}/${auth.quota.allocatedQuota}`;
});

/** 全量导航项；sysadmin 把系统看板放首位，其它角色仍从图像生成开始。 */
const nav = computed(() => {
  const dashboardEntry = {
    to: "/sysadmin/dashboard",
    label: t("nav.dashboard"),
    icon: LayoutDashboard,
    show: auth.isSysadmin
  };
  const sharedEntries = [
    {
      to: "/ai-image",
      label: t("nav.aiImage"),
      icon: Sparkles,
      show: auth.isSysadmin || (auth.generationExperience?.showAi ?? true)
    },
    {
      to: "/workspace",
      label: t("nav.workspace"),
      icon: Image,
      show: auth.isSysadmin || (auth.generationExperience?.showLegacy ?? true)
    },
    { to: "/history", label: t("nav.history"), icon: History, show: true },
    { to: "/admin/users", label: t("nav.admin"), icon: Users, show: auth.isAdmin }
  ];
  const sysadminEntries = [
    { to: "/sysadmin/keys", label: t("nav.keys"), icon: KeyRound, show: auth.isSysadmin },
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
    },
    {
      to: "/sysadmin/prompt-cases",
      label: t("nav.promptCases"),
      icon: Library,
      show: auth.isSysadmin
    },
    {
      to: "/sysadmin/experiments/generation",
      label: t("nav.generationExperiment"),
      icon: FlaskConical,
      show: auth.isSysadmin
    }
  ];
  return auth.isSysadmin
    ? [dashboardEntry, ...sharedEntries, ...sysadminEntries]
    : [...sharedEntries, dashboardEntry, ...sysadminEntries];
});

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

/** 取 `to` 的前三级 path 作前缀，避免子路由丢高亮（如 /sysadmin/users/xxx/sessions） */
function isActiveNav(to: string) {
  return route.path.startsWith(to.split("/").slice(0, 3).join("/"));
}

function syncSidebarMode() {
  isDesktopSidebar.value = sidebarModeQuery?.matches ?? false;
  if (isDesktopSidebar.value) ui.closeSidebar();
}

/** 桌面：折叠/展开侧栏宽；移动：开关抽屉 */
function toggleSidebarNav() {
  if (isDesktopSidebar.value) {
    ui.toggleSidebarCollapsed();
    return;
  }
  ui.toggleSidebar();
}

/** 点导航链接触发：仅移动关抽屉，避免桌面误关折叠态 */
function closeMobileSidebar() {
  if (!isDesktopSidebar.value) ui.closeSidebar();
}

function trackGenerationEntryExposure() {
  const events = buildGenerationEntryExposureEvents(visibleNav.value);
  for (const event of events) {
    const key = `${event.metadata?.variant ?? "unknown"}:${event.route}:${
      auth.generationExperience?.variant ?? "unknown"
    }`;
    if (exposedGenerationEntries.has(key)) continue;
    exposedGenerationEntries.add(key);
    void trackExperimentEvent(event);
  }
}

function trackGenerationRouteOpen() {
  const events = buildGenerationRouteOpenEvents(
    route.path,
    route.fullPath,
    auth.generationExperience,
    auth.isSysadmin,
    openedGenerationRoutes,
    directGenerationRoutes
  );
  for (const event of events) void trackExperimentEvent(event);
}

function trackGenerationHistoryReturn(previous: { path: string; fullPath: string } | undefined) {
  if (!previous) return;
  const events = buildGenerationHistoryReturnEvents(
    previous.path,
    previous.fullPath,
    route.path,
    route.fullPath,
    auth.generationExperience,
    auth.isSysadmin,
    returnedHistoryRoutes
  );
  for (const event of events) void trackExperimentEvent(event);
}

async function logout() {
  await auth.logout();
  await router.push("/login");
}

/** 点击主题菜单外关闭；目标在 ref 内则忽略 */
function closeThemeMenu(event: PointerEvent) {
  if (!themeMenuOpen.value) return;
  if (themeMenuRef.value?.contains(event.target as Node)) return;
  themeMenuOpen.value = false;
}

// 换页后收起移动侧栏，避免挡内容
watch(
  () => ({ path: route.path, fullPath: route.fullPath }),
  (_current, previous) => {
    closeMobileSidebar();
    trackGenerationHistoryReturn(previous);
    trackGenerationEntryExposure();
    trackGenerationRouteOpen();
  }
);

watch(
  () => [
    auth.generationExperience?.variant,
    auth.generationExperience?.navTarget,
    auth.generationExperience?.showAi,
    auth.generationExperience?.showLegacy,
    ui.locale
  ],
  () => {
    trackGenerationEntryExposure();
    trackGenerationRouteOpen();
  }
);

onMounted(() => {
  document.addEventListener("pointerdown", closeThemeMenu);
  sidebarModeQuery = window.matchMedia("(min-width: 1024px)");
  syncSidebarMode();
  sidebarModeQuery.addEventListener("change", syncSidebarMode);
  stopSidebarModeSync = () => sidebarModeQuery?.removeEventListener("change", syncSidebarMode);
  trackGenerationEntryExposure();
  trackGenerationRouteOpen();
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", closeThemeMenu);
  stopSidebarModeSync?.();
});
</script>

<template>
  <div class="flex h-dvh overflow-hidden bg-background text-foreground">
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

<script setup lang="ts">
/**
 * 应用壳（需已登录页使用）：
 * - **侧栏**：`lg` 以上固定为宽屏侧栏，可 `sidebarCollapsed` 收图标栏；以下用 `sidebarOpen` + 遮罩抽屉；
 * - **顶栏**：菜单、标语、语言、主题下拉、设置、登出；
 * - **配额**：侧栏底部卡片展示「剩余/总额」或无限；
 * - **路由高亮**：`isActiveNav` 用路径前三段前缀匹配，避免 `/sysadmin/foo` 与子路径全等失败。
 */
import { RouterLink } from "vue-router";
import type { HTMLAttributes } from "vue";
import { LogOut, Menu, Settings } from "@lucide/vue";
import AnnouncementBell from "@/components/announcements/AnnouncementBell.vue";
import BrandMark from "@/components/brand/BrandMark.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { useAppShellController } from "./useAppShellController";

const shellProps = withDefaults(
  defineProps<{
    contentScrollable?: boolean;
    mainClass?: HTMLAttributes["class"];
  }>(),
  {
    contentScrollable: true,
    mainClass: undefined
  }
);

const {
  auth,
  ui,
  t,
  themeMenuOpen,
  themeMenuRef,
  isDesktopSidebar,
  quotaLabel,
  visibleNav,
  themeOptions,
  currentTheme,
  themeTitle,
  sidebarToggleLabel,
  userInitial,
  userSummaryTitle,
  selectTheme,
  isActiveNav,
  toggleSidebarNav,
  closeMobileSidebar,
  logout
} = useAppShellController();

const mainBaseClass = "mx-auto w-full max-w-none px-3 pb-24 pt-3 sm:px-4 lg:px-5 lg:pb-5";
</script>

<template>
  <div class="app-shell flex h-dvh overflow-hidden text-foreground">
    <button
      v-if="ui.sidebarOpen"
      class="fixed inset-0 z-20 bg-slate-950/45 backdrop-blur-sm lg:hidden"
      type="button"
      :aria-label="t('shell.closeSidebar')"
      @click="ui.closeSidebar()"
    />
    <aside
      id="app-sidebar"
      class="app-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col transition-[transform,width] duration-200 ease-out lg:static lg:translate-x-0"
      :class="[
        ui.sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        ui.sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'
      ]"
    >
      <div
        class="flex h-16 items-center gap-3 px-4"
        :class="ui.sidebarCollapsed ? 'lg:justify-center lg:px-0' : ''"
      >
        <BrandMark class="size-9 shrink-0 rounded-lg shadow-sm" />
        <div class="min-w-0" :class="ui.sidebarCollapsed ? 'lg:hidden' : ''">
          <p class="text-sm font-semibold">Edge Muse</p>
          <p class="text-xs text-muted-foreground">{{ t("shell.subtitle") }}</p>
        </div>
      </div>
      <nav class="thin-scrollbar flex-1 space-y-1 overflow-y-auto px-3 py-3">
        <RouterLink
          v-for="item in visibleNav"
          :key="item.to"
          :to="item.to"
          class="app-nav-link flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-muted-foreground transition"
          :class="[
            isActiveNav(item.to) ? 'app-nav-link--active text-foreground' : '',
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
      <div class="p-3" :class="ui.sidebarCollapsed ? 'lg:flex lg:justify-center lg:p-3' : ''">
        <div
          class="app-user-card rounded-lg border border-border p-3"
          :class="ui.sidebarCollapsed ? 'lg:hidden' : ''"
        >
          <p class="truncate text-sm font-semibold">{{ auth.user?.nickname }}</p>
          <p class="truncate text-xs text-muted-foreground">{{ auth.user?.email }}</p>
          <div class="mt-3 flex items-center justify-between text-xs">
            <span class="text-muted-foreground">{{ t("common.quota") }}</span>
            <span class="font-mono">{{ quotaLabel }}</span>
          </div>
        </div>
        <div
          v-if="ui.sidebarCollapsed"
          class="hidden size-10 items-center justify-center rounded-lg border border-border bg-card text-sm font-semibold shadow-sm lg:flex"
          :title="userSummaryTitle"
          :aria-label="userSummaryTitle"
        >
          {{ userInitial }}
        </div>
      </div>
    </aside>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col">
      <header
        class="app-header z-30 flex h-16 shrink-0 items-center justify-between px-3 backdrop-blur sm:px-4"
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
        <div class="hidden min-w-0 flex-1 px-4 text-sm text-muted-foreground lg:block">
          {{ t("shell.tagline") }}
        </div>
        <div class="flex items-center gap-1.5 sm:gap-2">
          <AnnouncementBell />
          <select
            class="ui-field h-9 w-20 px-2 text-sm sm:w-24"
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
      <ScrollArea v-if="shellProps.contentScrollable" class="min-h-0 flex-1">
        <main :class="cn(mainBaseClass, shellProps.mainClass)">
          <slot />
        </main>
      </ScrollArea>
      <main
        v-else
        :class="cn(mainBaseClass, 'min-h-0 flex-1 overflow-hidden', shellProps.mainClass)"
      >
        <slot />
      </main>
    </div>

    <nav class="app-mobile-nav fixed inset-x-3 bottom-3 z-40 grid gap-1 rounded-lg p-1 lg:hidden">
      <RouterLink
        v-for="item in visibleNav.slice(0, 5)"
        :key="item.to"
        :to="item.to"
        class="app-mobile-nav-link"
        :class="isActiveNav(item.to) ? 'app-mobile-nav-link--active' : ''"
        :aria-label="item.label"
        :title="item.label"
        @click="closeMobileSidebar"
      >
        <component :is="item.icon" class="h-4 w-4" />
        <span class="truncate">{{ item.label }}</span>
      </RouterLink>
    </nav>
  </div>
</template>

<style scoped>
.app-shell {
  background:
    linear-gradient(180deg, color-mix(in oklch, var(--card), transparent 25%), transparent 10rem),
    var(--background);
}

.app-sidebar {
  border-right: 1px solid color-mix(in oklch, var(--border), transparent 18%);
  background: color-mix(in oklch, var(--surface-strong), transparent 8%);
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(22px);
}

.app-header {
  border-bottom: 1px solid color-mix(in oklch, var(--border), transparent 35%);
  background: color-mix(in oklch, var(--surface), transparent 12%);
}

.app-nav-link:hover {
  background: color-mix(in oklch, var(--primary), transparent 91%);
  color: var(--foreground);
}

.app-nav-link--active {
  border: 1px solid color-mix(in oklch, var(--primary), transparent 66%);
  background: color-mix(in oklch, var(--primary), transparent 88%);
  box-shadow: inset 3px 0 0 var(--primary);
}

.app-user-card {
  background: color-mix(in oklch, var(--card), transparent 12%);
  box-shadow: 0 10px 26px color-mix(in oklch, var(--foreground), transparent 92%);
}

.app-mobile-nav {
  grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
  border: 1px solid color-mix(in oklch, var(--border), transparent 18%);
  background: color-mix(in oklch, var(--surface-strong), transparent 5%);
  box-shadow: var(--shadow-soft);
  backdrop-filter: blur(22px);
}

.app-mobile-nav-link {
  display: flex;
  min-width: 0;
  height: 3.25rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.25rem;
  border-radius: 0.5rem;
  color: var(--muted-foreground);
  font-size: 0.6875rem;
  font-weight: 700;
  line-height: 1;
}

.app-mobile-nav-link--active {
  background: color-mix(in oklch, var(--primary), transparent 88%);
  color: var(--primary);
}
</style>

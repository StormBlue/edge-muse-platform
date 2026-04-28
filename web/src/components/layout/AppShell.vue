<script setup lang="ts">
/**
 * 应用壳（需已登录页使用）：
 * - **侧栏**：`lg` 以上固定为宽屏侧栏，可 `sidebarCollapsed` 收图标栏；以下用 `sidebarOpen` + 遮罩抽屉；
 * - **顶栏**：菜单、标语、语言、主题下拉、设置、登出；
 * - **配额**：侧栏底部卡片展示「剩余/总额」或无限；
 * - **路由高亮**：`isActiveNav` 用路径前三段前缀匹配，避免 `/sysadmin/foo` 与子路径全等失败。
 */
import { RouterLink } from "vue-router";
import { LogOut, Menu, Settings } from "lucide-vue-next";
import BrandMark from "@/components/brand/BrandMark.vue";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useAppShellController } from "./useAppShellController";

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

<script setup lang="ts">
/**
 * 应用壳（需已登录页使用）：
 * - **侧栏**：`lg` 以上固定为宽屏侧栏，可 `sidebarCollapsed` 收图标栏；以下用 `sidebarOpen` + 遮罩抽屉；
 * - **顶栏**：菜单、标语、语言、主题下拉、设置、登出；
 * - **配额**：侧栏底部卡片展示「剩余/总额」或无限；
 * - **路由高亮**：`isActiveNav` 用路径前三段前缀匹配，避免 `/sysadmin/foo` 与子路径全等失败。
 */
import { RouterLink } from "vue-router";
import { computed, nextTick, ref, watch, type HTMLAttributes } from "vue";
import { FocusScope } from "reka-ui";
import { LogOut, Menu, Settings, X } from "@lucide/vue";
import AnnouncementBell from "@/components/announcements/AnnouncementBell.vue";
import BrandMark from "@/components/brand/BrandMark.vue";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { usePageScroll } from "./usePageScroll";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
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
  isDesktopSidebar,
  quotaLabel,
  visibleNav,
  mobileNav,
  pageTitle,
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

const mainBaseClass = "app-main mx-auto w-full max-w-[160rem] px-3 pt-3 sm:px-4 lg:px-5 lg:pb-5";
const sidebar = ref<HTMLElement | null>(null);
const viewport = ref<HTMLElement | null>(null);
const mobileSidebarOpen = computed(() => !isDesktopSidebar.value && ui.sidebarOpen);
usePageScroll(viewport);
let previousFocus: HTMLElement | null = null;
watch(mobileSidebarOpen, async (open) => {
  if (open)
    previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  await nextTick();
  if (open) sidebar.value?.querySelector<HTMLElement>("button, a[href]")?.focus();
  else if (previousFocus?.isConnected) previousFocus.focus();
});

function updateLocale(value: unknown) {
  if (!value) return;
  ui.setLocale(String(value));
}
</script>

<template>
  <div class="app-shell flex h-dvh overflow-hidden text-foreground">
    <Button
      v-if="ui.sidebarOpen"
      class="fixed inset-0 z-20 h-auto rounded-none bg-slate-950/45 p-0 backdrop-blur-sm lg:hidden"
      variant="ghost"
      type="button"
      :aria-label="t('shell.closeSidebar')"
      @click="ui.closeSidebar()"
    />
    <FocusScope
      as-child
      :trapped="mobileSidebarOpen"
      :loop="mobileSidebarOpen"
      @mount-auto-focus.prevent
      @unmount-auto-focus.prevent
    >
      <aside
        id="app-sidebar"
        ref="sidebar"
        :inert="!isDesktopSidebar && !ui.sidebarOpen"
        :aria-hidden="!isDesktopSidebar && !ui.sidebarOpen ? true : undefined"
        :role="mobileSidebarOpen ? 'dialog' : undefined"
        :aria-modal="mobileSidebarOpen ? true : undefined"
        :aria-label="t('shell.openSidebar')"
        class="app-sidebar fixed inset-y-0 left-0 z-40 flex w-64 flex-col transition-[transform,width] duration-200 ease-out lg:static lg:translate-x-0"
        :class="[
          ui.sidebarOpen ? 'translate-x-0' : '-translate-x-full',
          ui.sidebarCollapsed ? 'lg:w-20' : 'lg:w-64'
        ]"
        @keydown.esc.prevent="ui.closeSidebar()"
      >
        <div
          class="flex h-16 items-center gap-3 px-4"
          :class="ui.sidebarCollapsed ? 'lg:justify-center lg:px-0' : ''"
        >
          <Button
            v-if="!isDesktopSidebar"
            variant="ghost"
            size="icon"
            class="ml-auto order-last"
            :aria-label="t('shell.closeSidebar')"
            @click="ui.closeSidebar()"
          >
            <X class="size-4" />
          </Button>
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
            :aria-current="isActiveNav(item.to) ? 'page' : undefined"
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
    </FocusScope>

    <div class="flex min-h-0 min-w-0 flex-1 flex-col" :inert="mobileSidebarOpen">
      <header
        class="app-header z-30 flex h-16 shrink-0 items-center justify-between px-3 backdrop-blur sm:px-4"
      >
        <Button
          variant="secondary"
          size="icon"
          type="button"
          aria-controls="app-sidebar"
          :aria-expanded="isDesktopSidebar ? !ui.sidebarCollapsed : ui.sidebarOpen"
          :aria-label="sidebarToggleLabel"
          :title="sidebarToggleLabel"
          @click="toggleSidebarNav"
        >
          <Menu class="h-4 w-4" />
        </Button>
        <div class="hidden min-w-0 flex-1 truncate px-4 text-sm font-medium sm:block">
          {{ pageTitle }}
        </div>
        <div class="flex items-center gap-1.5 sm:gap-2">
          <AnnouncementBell />
          <div class="w-20 shrink-0 sm:w-24">
            <Select :model-value="ui.locale" @update:model-value="updateLocale">
              <SelectTrigger
                class="h-9 w-20 shrink-0 px-2 text-sm sm:w-24"
                :aria-label="t('common.language')"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="zh-CN">中文</SelectItem>
                <SelectItem value="en-US">EN</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Popover v-model:open="themeMenuOpen">
            <PopoverTrigger as-child>
              <Button
                variant="secondary"
                size="icon"
                type="button"
                :title="themeTitle"
                :aria-label="themeTitle"
              >
                <component :is="currentTheme.icon" class="h-5 w-5" :stroke-width="2.25" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" class="w-36 p-1">
              <Button
                v-for="option in themeOptions"
                :key="option.value"
                class="h-9 w-full justify-start px-2.5"
                :class="option.value === ui.theme ? 'text-foreground' : 'text-muted-foreground'"
                variant="ghost"
                type="button"
                role="menuitemradio"
                :aria-checked="option.value === ui.theme"
                @click="selectTheme(option.value)"
              >
                <component :is="option.icon" class="h-4 w-4" :stroke-width="2.25" />
                <span>{{ option.label }}</span>
              </Button>
            </PopoverContent>
          </Popover>
          <RouterLink
            class="inline-flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/80 focus-visible:ring-[3px] focus-visible:ring-ring/50"
            to="/settings/profile"
            :title="t('common.settings')"
            :aria-label="t('common.settings')"
          >
            <Settings class="h-4 w-4" />
          </RouterLink>
          <Button
            variant="secondary"
            size="icon"
            type="button"
            :aria-label="t('common.logout')"
            :title="t('common.logout')"
            @click="logout"
          >
            <LogOut class="h-4 w-4" />
          </Button>
        </div>
      </header>
      <div
        v-if="shellProps.contentScrollable"
        ref="viewport"
        class="app-content thin-scrollbar min-h-0 flex-1 overflow-y-auto"
      >
        <main :class="cn(mainBaseClass, shellProps.mainClass)">
          <slot />
        </main>
      </div>
      <main
        v-else
        :class="cn(mainBaseClass, 'min-h-0 flex-1 overflow-hidden', shellProps.mainClass)"
      >
        <slot />
      </main>
    </div>

    <nav
      :inert="mobileSidebarOpen"
      class="app-mobile-nav fixed inset-x-3 z-30 grid gap-1 rounded-lg p-1 lg:hidden"
    >
      <RouterLink
        v-for="item in mobileNav"
        :key="item.to"
        :to="item.to"
        class="app-mobile-nav-link"
        :class="isActiveNav(item.to) ? 'app-mobile-nav-link--active' : ''"
        :aria-label="item.label"
        :aria-current="isActiveNav(item.to) ? 'page' : undefined"
        :title="item.label"
        @click="closeMobileSidebar"
      >
        <component :is="item.icon" class="h-4 w-4" />
        <span class="truncate">{{ item.label }}</span>
      </RouterLink>
      <button
        type="button"
        class="app-mobile-nav-link"
        :aria-label="t('shell.openSidebar')"
        aria-controls="app-sidebar"
        :aria-expanded="ui.sidebarOpen"
        @click="ui.toggleSidebar()"
      >
        <Menu class="size-4" />
        <span>{{ t("shell.more") }}</span>
      </button>
    </nav>
  </div>
</template>

<style scoped>
.app-main {
  padding-bottom: calc(6rem + env(safe-area-inset-bottom, 0px));
}
.app-content {
  container: app-content / inline-size;
  scrollbar-gutter: stable;
}
@media (min-width: 1024px) {
  .app-main {
    padding-bottom: 1.25rem;
  }
}
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
  bottom: calc(0.75rem + env(safe-area-inset-bottom, 0px));
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

/**
 * 纯 UI 状态：主题、语言、侧栏开合并持久化到 localStorage（与鉴权/业务无关）。
 *
 * - 主题：`auto` 时跟踪系统深色变化（`startThemeSync` / `stopThemeSync` 与 HMR/重复入口成对使用）。
 * - 根节点：`applyTheme` 切换 `html.dark`，供 Tailwind `dark:` 变体。
 * - 侧栏：`sidebarOpen` 为移动端抽屉；`sidebarCollapsed` 为桌面窄条模式且持久化。
 */
import { defineStore } from "pinia";

const THEME_STORAGE_KEY = "edge-muse-theme";
const LOCALE_STORAGE_KEY = "edge-muse-locale";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "edge-muse-sidebar-collapsed";
/** 与设置页/类型导出一致，非法 localStorage 值会回落到默认 */
const themeModes = ["auto", "light", "dark"] as const;
const locales = ["zh-CN", "en-US"] as const;

export type ThemeMode = (typeof themeModes)[number];
export type AppLocale = (typeof locales)[number];

/** 供 `startThemeSync` 注销 `matchMedia` 监听，避免重复绑定 */
let stopSystemThemeSync: (() => void) | null = null;

function isThemeMode(value: string | null): value is ThemeMode {
  return themeModes.includes(value as ThemeMode);
}

function isAppLocale(value: string | null): value is AppLocale {
  return locales.includes(value as AppLocale);
}

function getInitialTheme(): ThemeMode {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(storedTheme) ? storedTheme : "auto";
}

/** 给 `main.ts` 创建 i18n 实例时使用，与 store 内 locale 保持一致 */
export function getInitialLocale(): AppLocale {
  const storedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);
  return isAppLocale(storedLocale) ? storedLocale : "zh-CN";
}

function getInitialSidebarCollapsed() {
  return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "true";
}

function prefersDarkTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export const useUiStore = defineStore("ui", {
  state: () => ({
    /** 主题：auto 时根据系统深色偏好与 `applyTheme` 切换 `html.dark` */
    theme: getInitialTheme(),
    locale: getInitialLocale(),
    /** 移动端窄屏下抽屉侧栏是否打开 */
    sidebarOpen: false,
    /** 桌面端侧栏是否折叠（持久化） */
    sidebarCollapsed: getInitialSidebarCollapsed()
  }),
  actions: {
    /** 按当前 theme 与系统偏好，切换根节点 `class="dark"`（Tailwind dark 变体） */
    applyTheme() {
      const dark = this.theme === "dark" || (this.theme === "auto" && prefersDarkTheme());
      document.documentElement.classList.toggle("dark", dark);
      localStorage.setItem(THEME_STORAGE_KEY, this.theme);
    },
    setTheme(theme: ThemeMode) {
      this.theme = theme;
      this.applyTheme();
    },
    /**
     * 在 auto 模式下，系统主题变化时自动重算 `applyTheme`
     * 与 `stopThemeSync` 成对使用，防热更新或重复起页面时多次监听 matchMedia
     */
    startThemeSync() {
      if (stopSystemThemeSync) return;

      const media = window.matchMedia("(prefers-color-scheme: dark)");
      const handleChange = () => {
        if (this.theme === "auto") this.applyTheme();
      };

      media.addEventListener("change", handleChange);
      stopSystemThemeSync = () => media.removeEventListener("change", handleChange);
    },
    stopThemeSync() {
      stopSystemThemeSync?.();
      stopSystemThemeSync = null;
    },
    /** 写入 i18n 与 `LOCALE_STORAGE_KEY`；非法值回落 zh-CN */
    setLocale(locale: string) {
      const nextLocale = isAppLocale(locale) ? locale : "zh-CN";
      this.locale = nextLocale;
      localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    },
    /** 移动抽屉侧栏打开（AppShell 里与 overlay 搭配） */
    openSidebar() {
      this.sidebarOpen = true;
    },
    closeSidebar() {
      this.sidebarOpen = false;
    },
    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen;
    },
    /** 桌面布局侧栏收折，持久化到 `SIDEBAR_COLLAPSED_STORAGE_KEY` */
    setSidebarCollapsed(collapsed: boolean) {
      this.sidebarCollapsed = collapsed;
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
    },
    /** 切换 `sidebarCollapsed` 并落盘，供顶栏按钮调用 */
    toggleSidebarCollapsed() {
      this.setSidebarCollapsed(!this.sidebarCollapsed);
    }
  }
});

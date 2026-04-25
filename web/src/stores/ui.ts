import { defineStore } from "pinia";

const THEME_STORAGE_KEY = "edge-muse-theme";
const LOCALE_STORAGE_KEY = "edge-muse-locale";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "edge-muse-sidebar-collapsed";
const themeModes = ["auto", "light", "dark"] as const;
const locales = ["zh-CN", "en-US"] as const;

export type ThemeMode = (typeof themeModes)[number];
export type AppLocale = (typeof locales)[number];

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
    theme: getInitialTheme(),
    locale: getInitialLocale(),
    sidebarOpen: false,
    sidebarCollapsed: getInitialSidebarCollapsed()
  }),
  actions: {
    applyTheme() {
      const dark = this.theme === "dark" || (this.theme === "auto" && prefersDarkTheme());
      document.documentElement.classList.toggle("dark", dark);
      localStorage.setItem(THEME_STORAGE_KEY, this.theme);
    },
    setTheme(theme: ThemeMode) {
      this.theme = theme;
      this.applyTheme();
    },
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
    setLocale(locale: string) {
      const nextLocale = isAppLocale(locale) ? locale : "zh-CN";
      this.locale = nextLocale;
      localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    },
    openSidebar() {
      this.sidebarOpen = true;
    },
    closeSidebar() {
      this.sidebarOpen = false;
    },
    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen;
    },
    setSidebarCollapsed(collapsed: boolean) {
      this.sidebarCollapsed = collapsed;
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(collapsed));
    },
    toggleSidebarCollapsed() {
      this.setSidebarCollapsed(!this.sidebarCollapsed);
    }
  }
});

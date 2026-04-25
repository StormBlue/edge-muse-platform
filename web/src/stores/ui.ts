import { defineStore } from "pinia";

const THEME_STORAGE_KEY = "edge-muse-theme";
const themeModes = ["auto", "light", "dark"] as const;

export type ThemeMode = (typeof themeModes)[number];

let stopSystemThemeSync: (() => void) | null = null;

function isThemeMode(value: string | null): value is ThemeMode {
  return themeModes.includes(value as ThemeMode);
}

function getInitialTheme(): ThemeMode {
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  return isThemeMode(storedTheme) ? storedTheme : "auto";
}

function prefersDarkTheme() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export const useUiStore = defineStore("ui", {
  state: () => ({
    theme: getInitialTheme(),
    locale: localStorage.getItem("edge-muse-locale") ?? "zh-CN",
    sidebarOpen: false
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
      this.locale = locale;
      localStorage.setItem("edge-muse-locale", locale);
    }
  }
});

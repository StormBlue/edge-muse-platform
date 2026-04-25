import { defineStore } from "pinia";

export type ThemeMode = "auto" | "light" | "dark";

export const useUiStore = defineStore("ui", {
  state: () => ({
    theme: (localStorage.getItem("edge-muse-theme") as ThemeMode | null) ?? "auto",
    locale: localStorage.getItem("edge-muse-locale") ?? "zh-CN",
    sidebarOpen: false
  }),
  actions: {
    applyTheme() {
      const dark =
        this.theme === "dark" ||
        (this.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
      localStorage.setItem("edge-muse-theme", this.theme);
    },
    setTheme(theme: ThemeMode) {
      this.theme = theme;
      this.applyTheme();
    },
    setLocale(locale: string) {
      this.locale = locale;
      localStorage.setItem("edge-muse-locale", locale);
    }
  }
});

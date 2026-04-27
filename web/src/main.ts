/**
 * 前端入口：挂载 Pinia（含持久化插件）、Vue Router、Vue I18n（Composition API 模式 legacy: false）。
 * 主题/语言初始值部分来自 `useUiStore` 使用的 localStorage，与根组件 `App.vue` 中 watch 同步。
 */
import { createApp } from "vue";
import { createPinia } from "pinia";
import piniaPluginPersistedstate from "pinia-plugin-persistedstate";
import { createI18n } from "vue-i18n";
import App from "./App.vue";
import router from "./router";
import zhCN from "./locales/zh-CN.json";
import enUS from "./locales/en-US.json";
import { getInitialLocale } from "./stores/ui";
import "./styles/globals.css";

const pinia = createPinia();
// persistedstate 与 auth/ui store 的 `persist.pick` 配合
pinia.use(piniaPluginPersistedstate);

// locale 与 `getInitialLocale` / UiStore 写入的 localStorage 对齐，避免首屏与切换不一致
const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: "en-US",
  messages: {
    "zh-CN": zhCN,
    "en-US": enUS
  }
});

// 顺序：Pinia → Router（守卫读 auth）→ i18n；主题在 App.vue 对 theme 的 watch 中套到 documentElement
createApp(App).use(pinia).use(router).use(i18n).mount("#app");

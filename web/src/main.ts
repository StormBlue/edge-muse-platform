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
pinia.use(piniaPluginPersistedstate);

const i18n = createI18n({
  legacy: false,
  locale: getInitialLocale(),
  fallbackLocale: "en-US",
  messages: {
    "zh-CN": zhCN,
    "en-US": enUS
  }
});

createApp(App).use(pinia).use(router).use(i18n).mount("#app");

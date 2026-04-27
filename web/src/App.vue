<script setup lang="ts">
/**
 * 根布局：全站路由出口 + Sonner 吐司。
 * - 主题：挂载时 `applyTheme` 并 `startThemeSync`（`theme === "auto"` 时跟系统 dark）；
 * - 语言：`ui.locale`（Pinia 持久化）驱动 vue-i18n 的 `locale`，并设 `document.documentElement.lang` 利于可访问与字体。
 */
import { onBeforeUnmount, onMounted, watch } from "vue";
import { RouterView } from "vue-router";
import { useI18n } from "vue-i18n";
import { Toaster } from "vue-sonner";
import "vue-sonner/style.css";
import { useUiStore } from "@/stores/ui";

const ui = useUiStore();
const { locale } = useI18n();

onMounted(() => {
  ui.applyTheme();
  ui.startThemeSync();
});
onBeforeUnmount(() => ui.stopThemeSync());
// immediate：首屏与切换语言时同步 i18n 与 <html lang>
watch(
  () => ui.locale,
  (value) => {
    locale.value = value;
    document.documentElement.lang = value;
  },
  { immediate: true }
);
</script>

<template>
  <RouterView />
  <Toaster position="top-right" rich-colors />
</template>

<script setup lang="ts">
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
watch(
  () => ui.locale,
  (value) => {
    locale.value = value;
  },
  { immediate: true }
);
</script>

<template>
  <RouterView />
  <Toaster position="top-right" rich-colors />
</template>

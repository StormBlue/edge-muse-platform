<script setup lang="ts">
import { ImageOff, RotateCw } from "lucide-vue-next";
import { useI18n } from "vue-i18n";

defineProps<{
  title: string;
  message: string;
}>();

const emit = defineEmits<{
  retry: [];
}>();

const { t } = useI18n();
</script>

<template>
  <div class="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-center">
    <div
      class="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive"
    >
      <ImageOff class="h-6 w-6" />
    </div>
    <p class="mt-3 text-sm font-semibold text-foreground">{{ title }}</p>
    <p class="mt-2 text-xs leading-5 text-muted-foreground">{{ message }}</p>
    <button
      class="ui-button ui-button-secondary mt-3 h-8 border-destructive/30 text-destructive"
      type="button"
      @click="emit('retry')"
    >
      <RotateCw class="h-3.5 w-3.5" />
      {{ t("common.retry") }}
    </button>
  </div>
</template>

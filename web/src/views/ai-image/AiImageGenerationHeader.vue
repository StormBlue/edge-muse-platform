<script setup lang="ts">
import { ArrowLeft } from "@lucide/vue";
import { useI18n } from "vue-i18n";

defineProps<{
  disabled: boolean;
  title: string;
}>();

const emit = defineEmits<{
  back: [];
}>();

const { t } = useI18n();
</script>

<template>
  <section class="generation-page-header">
    <div class="flex min-w-0 items-center gap-3">
      <button
        class="ui-button ui-button-secondary h-10 shrink-0 px-4 text-sm"
        type="button"
        :disabled="disabled"
        @click="emit('back')"
      >
        <ArrowLeft class="h-4 w-4" />
        {{ t("aiImage.backToCases") }}
      </button>
      <div class="min-w-0">
        <h1 class="truncate text-lg font-semibold leading-7">{{ title }}</h1>
      </div>
    </div>
  </section>
</template>
<style scoped>
.generation-page-header {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  border: 1px solid color-mix(in oklch, var(--border), transparent 25%);
  border-radius: 0.5rem;
  background: var(--surface);
  padding: 0.75rem;
  box-shadow: var(--shadow-panel);
  backdrop-filter: blur(18px);
}
</style>

<script setup lang="ts">
import { useI18n } from "vue-i18n";
import type { SessionMode } from "@/stores/session";
import type { ModeOption } from "./workspaceOptions";

defineProps<{
  activeMode: SessionMode;
  modeOptions: ModeOption[];
  disabled: boolean;
}>();

defineEmits<{ select: [mode: SessionMode] }>();

const { t } = useI18n();
</script>

<template>
  <section class="panel p-2.5 sm:p-3">
    <div class="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold">{{ t("workspace.generationMode") }}</h2>
      </div>
      <div class="grid w-full grid-cols-[repeat(auto-fit,minmax(9rem,1fr))] gap-2 xl:max-w-3xl">
        <button
          v-for="option in modeOptions"
          :key="option.value"
          class="flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition"
          :class="[
            activeMode === option.value
              ? 'border-primary bg-primary/10 text-foreground'
              : 'border-border bg-muted/45 text-muted-foreground hover:bg-muted',
            disabled ? 'cursor-not-allowed opacity-70' : ''
          ]"
          type="button"
          :aria-pressed="activeMode === option.value"
          :disabled="disabled"
          @click="$emit('select', option.value)"
        >
          <component :is="option.icon" class="h-4 w-4" />
          <span>{{ option.label }}</span>
        </button>
      </div>
    </div>
  </section>
</template>

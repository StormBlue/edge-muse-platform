<script setup lang="ts">
import { Image as ImageIcon, ImageOff, Loader2, RotateCw } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import type { ImageAttachment } from "@/stores/session";

defineProps<{
  compact?: boolean;
  title: string;
  subtitle?: string;
  activeFailed: boolean;
  activePreviewImage: ImageAttachment | null;
  resultImages: ImageAttachment[];
  hasRunningTask: boolean;
  generationStatusLabel: string;
  generationProgress: number;
  generationPrompt: string;
  failedTitle: string;
  failedMessage: string;
}>();

defineEmits<{
  retryFailed: [];
  openPreview: [];
  selectImageId: [id: string];
}>();

const { t } = useI18n();
</script>

<template>
  <section
    class="panel flex min-w-0 flex-col overflow-hidden"
    :class="compact ? 'compact-result-panel min-h-32' : 'task-result-panel min-h-[24rem]'"
  >
    <div class="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
      <div class="min-w-0">
        <h2 class="text-sm font-semibold">{{ title }}</h2>
        <p v-if="subtitle" class="mt-1 truncate text-xs text-muted-foreground">
          {{ subtitle }}
        </p>
      </div>
      <div v-if="compact" class="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <span
          v-if="hasRunningTask"
          class="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-2.5 py-1 text-xs font-semibold text-foreground"
        >
          <Loader2 class="h-3.5 w-3.5 animate-spin text-primary" />
          {{ generationStatusLabel }}
        </span>
        <span
          v-else-if="activeFailed"
          class="inline-flex items-center gap-2 rounded-full border border-destructive/30 bg-destructive/5 px-2.5 py-1 text-xs font-semibold text-destructive"
        >
          <ImageOff class="h-3.5 w-3.5" />
          {{ t("workspace.generationFailed") }}
        </span>
        <span class="rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground">
          {{ resultImages.length }}
        </span>
      </div>
    </div>

    <div
      v-if="activeFailed"
      class="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
      :class="compact ? 'gap-4 p-6' : 'gap-5 p-6'"
    >
      <div
        class="flex items-center justify-center rounded-full bg-destructive/10 text-destructive"
        :class="compact ? 'h-16 w-16' : 'h-20 w-20'"
      >
        <ImageOff :class="compact ? 'h-8 w-8' : 'h-10 w-10'" />
      </div>
      <div :class="compact ? 'max-w-sm' : 'max-w-xl'">
        <p :class="compact ? 'text-base font-semibold' : 'text-xl font-semibold'">
          {{ failedTitle }}
        </p>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          {{ failedMessage }}
        </p>
      </div>
      <button
        class="ui-button ui-button-secondary h-9 border-destructive/30 text-destructive"
        type="button"
        @click="$emit('retryFailed')"
      >
        <RotateCw class="h-4 w-4" />
        {{ t("common.retry") }}
      </button>
    </div>

    <div
      v-else-if="activePreviewImage"
      class="flex min-h-0 flex-1 flex-col"
      :class="compact ? 'p-3' : 'p-4'"
    >
      <button
        class="group relative flex min-h-0 flex-1 items-center justify-center overflow-hidden rounded-lg border border-border bg-background"
        type="button"
        :title="t('workspace.openPreview')"
        @click="$emit('openPreview')"
      >
        <img
          class="max-h-full max-w-full object-contain transition duration-200 group-hover:scale-[1.01]"
          :src="activePreviewImage.url"
          alt=""
        />
        <div
          v-if="hasRunningTask"
          class="absolute rounded-lg border border-primary/25 bg-card/95 p-3 text-left shadow-sm backdrop-blur"
          :class="compact ? 'inset-x-3 bottom-3' : 'inset-x-4 bottom-4'"
        >
          <div class="flex items-center gap-2 text-sm font-semibold">
            <Loader2 class="h-4 w-4 animate-spin text-primary" />
            {{ t("workspace.generatingNewResult") }}
            <span class="ml-auto text-xs tabular-nums text-muted-foreground">
              {{ t("workspace.generationProgress", { percent: generationProgress }) }}
            </span>
          </div>
          <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-primary/15">
            <div
              class="h-full rounded-full bg-primary transition-all duration-500"
              :style="{ width: `${generationProgress}%` }"
            ></div>
          </div>
        </div>
      </button>
      <div
        v-if="!compact && resultImages.length > 1"
        class="thin-scrollbar mt-3 flex shrink-0 gap-2 overflow-x-auto pb-1"
      >
        <button
          v-for="image in resultImages"
          :key="image.id"
          class="h-16 w-20 shrink-0 overflow-hidden rounded-lg border bg-muted transition"
          :class="image.id === activePreviewImage.id ? 'border-primary' : 'border-border'"
          type="button"
          @click="$emit('selectImageId', image.id)"
        >
          <img class="h-full w-full object-contain" :src="image.url" alt="" loading="lazy" />
        </button>
      </div>
    </div>

    <div
      v-else-if="hasRunningTask"
      class="flex min-h-0 flex-1 flex-col items-center justify-center text-center"
      :class="compact ? 'gap-4 p-6' : 'gap-5 p-6'"
    >
      <div
        class="flex items-center justify-center rounded-full bg-primary/10 text-primary"
        :class="compact ? 'h-16 w-16' : 'h-20 w-20'"
      >
        <Loader2 :class="compact ? 'h-7 w-7 animate-spin' : 'h-9 w-9 animate-spin'" />
      </div>
      <div :class="compact ? 'max-w-sm' : 'max-w-xl'">
        <p :class="compact ? 'text-base font-semibold' : 'text-xl font-semibold'">
          {{ generationStatusLabel }}
        </p>
        <p class="mt-3 text-sm leading-6 text-muted-foreground">
          {{ generationPrompt || t("workspace.generationHint") }}
        </p>
      </div>
      <div :class="compact ? 'w-full max-w-xs' : 'w-full max-w-md'">
        <div class="flex items-center justify-between text-xs text-muted-foreground">
          <span>{{ t("workspace.generationHint") }}</span>
          <span class="tabular-nums">
            {{ t("workspace.generationProgress", { percent: generationProgress }) }}
          </span>
        </div>
        <div
          class="mt-2 overflow-hidden rounded-full bg-primary/15"
          :class="compact ? 'h-2' : 'h-2.5'"
        >
          <div
            class="h-full rounded-full bg-primary transition-all duration-500"
            :style="{ width: `${generationProgress}%` }"
          ></div>
        </div>
      </div>
    </div>

    <div
      v-else
      class="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted-foreground"
    >
      <ImageIcon class="h-10 w-10" />
      {{ t("workspace.noResult") }}
    </div>
  </section>
</template>

<style scoped>
.task-result-panel,
.compact-result-panel {
  background: var(--surface);
}

.task-result-panel > div:nth-child(2),
.compact-result-panel > div:nth-child(2) {
  background:
    linear-gradient(
      180deg,
      color-mix(in oklch, var(--primary), transparent 96%),
      transparent 10rem
    ),
    color-mix(in oklch, var(--muted), transparent 72%);
}
</style>

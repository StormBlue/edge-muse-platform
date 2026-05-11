<script setup lang="ts">
import { Image as ImageIcon, Loader2, Maximize2 } from "lucide-vue-next";
import { useI18n } from "vue-i18n";
import AiImageFailurePanel from "./AiImageFailurePanel.vue";
import PromptCaseThumbnail from "./PromptCaseThumbnail.vue";
import type { ImageAttachment } from "@/stores/session";
import type { PromptCase } from "@/types/promptCases";

defineProps<{
  activeFailed: boolean;
  caseItem: PromptCase | null;
  failedMessage: string;
  failedTitle: string;
  generationProgress: number;
  generationPrompt: string;
  generationStatusLabel: string;
  hasRunningTask: boolean;
  interactionLocked: boolean;
  resultImages: ImageAttachment[];
  selectedCaseTitle: string;
}>();

const emit = defineEmits<{
  openCasePreview: [];
  openImage: [image: ImageAttachment];
  retryFailed: [];
}>();

const { t } = useI18n();
</script>

<template>
  <section class="ai-output-panel panel">
    <div class="ai-generated-area">
      <button
        v-if="caseItem?.thumbnailUrl"
        class="ai-case-floating-preview group"
        type="button"
        :title="t('aiImage.openCasePreview')"
        :disabled="interactionLocked"
        @click="emit('openCasePreview')"
      >
        <span
          class="absolute right-1.5 top-1.5 inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/85 text-foreground opacity-0 transition group-hover:opacity-100"
        >
          <Maximize2 class="h-4 w-4" />
        </span>
        <PromptCaseThumbnail
          class="ai-case-floating-thumbnail"
          :src="caseItem.thumbnailUrl"
          :alt="selectedCaseTitle"
          fit="contain"
          icon-class="h-7 w-7"
        />
      </button>

      <div class="ai-generated-body">
        <div v-if="hasRunningTask" class="ai-generation-progress" role="status" aria-live="polite">
          <div class="ai-generation-progress-header">
            <span
              class="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground"
            >
              <Loader2 class="h-5 w-5 animate-spin" />
            </span>
            <div class="ai-generation-progress-copy">
              <div class="ai-generation-progress-title">
                <p class="text-sm font-semibold">{{ generationStatusLabel }}</p>
                <span class="ai-generation-progress-percent">
                  {{ t("workspace.generationProgress", { percent: generationProgress }) }}
                </span>
              </div>
              <p class="ai-generation-progress-prompt">
                {{ generationPrompt || t("workspace.generationHint") }}
              </p>
            </div>
          </div>
          <div
            class="ai-generation-progress-track"
            role="progressbar"
            :aria-label="generationStatusLabel"
            :aria-valuenow="generationProgress"
            aria-valuemin="0"
            aria-valuemax="100"
          >
            <div
              class="h-full rounded-full bg-primary transition-all duration-500"
              :style="{ width: `${generationProgress}%` }"
            ></div>
          </div>
        </div>

        <AiImageFailurePanel
          v-else-if="activeFailed"
          :message="failedMessage"
          :title="failedTitle"
          @retry="emit('retryFailed')"
        />

        <div
          v-else-if="resultImages.length"
          class="ai-result-grid"
          :class="{ 'ai-result-grid--single': resultImages.length === 1 }"
        >
          <button
            v-for="image in resultImages"
            :key="image.id"
            class="ai-result-tile group"
            type="button"
            :disabled="interactionLocked"
            :title="t('workspace.openPreview')"
            @click="emit('openImage', image)"
          >
            <img
              class="ai-result-image"
              :src="image.url"
              :alt="image.prompt ?? ''"
              loading="lazy"
            />
            <span
              class="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-md bg-background/85 text-foreground opacity-0 transition group-hover:opacity-100"
            >
              <ImageIcon class="h-4 w-4" />
            </span>
          </button>
        </div>

        <div v-else class="ai-result-empty">
          <ImageIcon class="h-10 w-10" />
        </div>
      </div>
    </div>
  </section>
</template>
<style scoped>
.ai-output-panel {
  grid-area: stage;
  min-width: 0;
  min-height: clamp(26rem, 58dvh, 44rem);
  overflow: hidden;
}

.ai-case-floating-preview {
  position: absolute;
  left: clamp(1rem, 2vw, 1.5rem);
  top: clamp(1rem, 2vw, 1.5rem);
  z-index: 2;
  width: clamp(5.5rem, 13vw, 10rem);
  min-width: 5.5rem;
  max-width: 10rem;
  aspect-ratio: 1;
  overflow: hidden;
  border: 1px solid color-mix(in oklch, var(--border), transparent 8%);
  border-radius: 0.5rem;
  background:
    linear-gradient(135deg, rgb(255 255 255 / 0.42), rgb(226 232 240 / 0.18)),
    color-mix(in oklch, var(--primary), transparent 92%);
  backdrop-filter: blur(10px);
  box-shadow: 0 12px 30px rgb(15 23 42 / 0.16);
}

.ai-case-floating-preview :deep(.ai-case-floating-thumbnail) {
  background: transparent !important;
}

.ai-generated-area {
  position: relative;
  display: flex;
  height: 100%;
  min-height: 0;
  flex-direction: column;
}

.ai-generated-body {
  display: flex;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  padding: 0.875rem;
  background:
    linear-gradient(180deg, color-mix(in oklch, var(--primary), transparent 96%), transparent 9rem),
    color-mix(in oklch, var(--muted), transparent 72%);
}

.ai-result-grid {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 100%;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 14rem), 1fr));
  grid-auto-rows: minmax(12rem, 1fr);
  gap: 0.75rem;
  overflow-y: auto;
}

.ai-result-grid--single {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 100%;
  align-items: center;
  justify-content: center;
  overflow: hidden;
}

.ai-result-tile {
  position: relative;
  display: flex;
  min-height: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--muted), transparent 55%);
  box-shadow: inset 0 0 0 1px color-mix(in oklch, var(--card), transparent 55%);
}

.ai-result-grid--single .ai-result-tile {
  width: 100%;
  height: 100%;
  align-self: stretch;
}

.ai-result-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center;
}

.ai-generation-progress,
.ai-result-empty {
  display: flex;
  width: 100%;
  min-height: 100%;
  flex-direction: column;
  justify-content: center;
  border: 1px dashed var(--border);
  border-radius: 0.5rem;
  background: color-mix(in oklch, var(--muted), transparent 70%);
  padding: 1rem;
}

.ai-generation-progress {
  min-width: 0;
  gap: 1rem;
}

.ai-generation-progress-header {
  display: grid;
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: 0.875rem;
}

.ai-generation-progress-copy {
  display: grid;
  min-width: 0;
  gap: 0.375rem;
}

.ai-generation-progress-title {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.ai-generation-progress-percent {
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid color-mix(in oklch, var(--primary), transparent 70%);
  background: color-mix(in oklch, var(--primary), transparent 88%);
  padding: 0.125rem 0.5rem;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--primary);
}

.ai-generation-progress-prompt {
  display: -webkit-box;
  min-width: 0;
  max-width: 100%;
  overflow: hidden;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  font-size: 0.75rem;
  line-height: 1.25rem;
  color: var(--muted-foreground);
}

.ai-generation-progress-track {
  height: 0.625rem;
  min-width: 0;
  overflow: hidden;
  border-radius: 999px;
  background: color-mix(in oklch, var(--primary), transparent 86%);
}

.ai-result-empty {
  align-items: center;
  gap: 0.75rem;
  color: var(--muted-foreground);
  text-align: center;
}

@container (min-width: 50rem) {
  .ai-output-panel {
    min-height: 0;
  }
}

@container (min-width: 78rem) {
  .ai-output-panel {
    min-height: 0;
  }
}
</style>

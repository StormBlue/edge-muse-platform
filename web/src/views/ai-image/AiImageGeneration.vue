<script setup lang="ts">
/**
 * 面向普通用户的 AI 图像生成页。
 *
 * 页面把“选案例、改 Prompt、提交生成”串成一个轻量流程；真实生图仍复用现有任务链路。
 */
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { ArrowLeft, WandSparkles } from "lucide-vue-next";
import AppShell from "@/components/layout/AppShell.vue";
import ImageViewer from "@/components/image/ImageViewer.vue";
import AiImagePromptPanel from "./AiImagePromptPanel.vue";
import PromptCaseDetail from "./PromptCaseDetail.vue";
import PromptCaseGallery from "./PromptCaseGallery.vue";
import PromptCaseMobileSheet from "./PromptCaseMobileSheet.vue";
import { useAuthStore } from "@/stores/auth";
import { resolveAiImageRecommendedSize, type AiImageSizeFallback } from "./aiImageSizeFallback";
import { useAiImageGenerationTracking } from "./useAiImageGenerationTracking";
import { useAiImageCases } from "./useAiImageCases";
import { useAiImageGenerationSubmit } from "./useAiImageGenerationSubmit";
import { promptCasePreviewImage } from "./promptCasePreviewImage";
import type { ImageAttachment } from "@/stores/session";
import type { PromptCase } from "@/types/promptCases";

const { t } = useI18n();
const auth = useAuthStore();
const generation = useAiImageGenerationSubmit();
const cases = useAiImageCases({ supportedModes: generation.supportedModes });
const {
  trackPromptCaseSelected,
  trackAssistantStarted,
  trackAssistantPromptFilled,
  buildSubmitGenerationEvent
} = useAiImageGenerationTracking();
const mobileCaseSheetOpen = ref(false);
const caseBrowserCollapsed = ref(false);
const selectedImage = ref<ImageAttachment | null>(null);
const sizeFallback = ref<AiImageSizeFallback | null>(null);

const activeCase = computed(() => cases.caseContext.value);
const selectedCaseTitle = computed(() => activeCase.value?.title ?? t("aiImage.blankCase"));
const pageInteractionLocked = computed(
  () => generation.submitting.value || generation.hasRunningTask.value
);
const viewerImages = computed(() =>
  selectedImage.value?.id.startsWith("case:")
    ? selectedImage.value
      ? [selectedImage.value]
      : []
    : generation.resultImages.value
);
const sizeFallbackNotice = computed(() =>
  sizeFallback.value
    ? t("aiImage.sizeFallback", {
        recommended: sizeFallback.value.recommendedSize,
        size: sizeFallback.value.actualSize
      })
    : ""
);

function selectCase(item: PromptCase) {
  caseBrowserCollapsed.value = false;
  cases.previewCase(item, { userSelected: true });
  mobileCaseSheetOpen.value = shouldOpenMobileCaseSheet();
  trackPromptCaseSelected(item);
}

function applyCase(item: PromptCase) {
  const result = cases.applyCasePrompt(item);
  syncGenerationFromCase(item, result.mode);
  caseBrowserCollapsed.value = true;
  mobileCaseSheetOpen.value = false;
}

function startBlankAssistantFlow() {
  if (pageInteractionLocked.value) return;
  cases.startBlankCase();
  sizeFallback.value = null;
  caseBrowserCollapsed.value = true;
  mobileCaseSheetOpen.value = false;
  openAssistant();
}

function reopenCaseBrowser() {
  if (pageInteractionLocked.value) return;
  caseBrowserCollapsed.value = false;
}

function syncGenerationFromCase(item: PromptCase, mode: PromptCase["modes"][number]) {
  generation.mode.value = mode;
  applyRecommendedSize(item.recommendedSize);
}

function syncCurrentCaseToGeneration() {
  const item = cases.selected.value;
  if (!item) {
    const fallbackMode = generation.supportedModes.value[0];
    if (fallbackMode && !generation.supportedModes.value.includes(generation.mode.value)) {
      generation.mode.value = fallbackMode;
    }
    sizeFallback.value = null;
    return;
  }
  if (cases.finalPromptSource.value !== "case") return;
  syncGenerationFromCase(item, cases.selectedMode.value);
}

function applyRecommendedSize(recommendedSize: string) {
  const result = resolveAiImageRecommendedSize(
    recommendedSize,
    generation.sizeOptions.value,
    generation.size.value
  );
  generation.size.value = result.size;
  sizeFallback.value = result.fallback;
}

function setGenerationSize(value: string) {
  generation.size.value = value;
  sizeFallback.value = null;
}

function copyPrompt() {
  if (!cases.finalPrompt.value.trim()) return;
  void navigator.clipboard.writeText(cases.finalPrompt.value);
  toast.success(t("promptCases.promptCopied"));
}

function fillAssistantPrompt(value: {
  prompt: string;
  recommendedSize: string;
  turnCount: number;
  auto?: boolean;
}) {
  cases.setPrompt(value.prompt, "assistant");
  applyRecommendedSize(value.recommendedSize);
  trackAssistantPromptFilled({
    caseId: cases.caseContext.value?.id,
    prompt: value.prompt,
    turnCount: value.turnCount
  });
}

function openAssistant() {
  trackAssistantStarted({
    caseId: cases.caseContext.value?.id,
    mode: generation.mode.value
  });
}

function openGeneratedImage(image: ImageAttachment) {
  if (pageInteractionLocked.value) return;
  selectedImage.value = image;
}

function openSelectedCasePreview() {
  if (pageInteractionLocked.value || !activeCase.value) return;
  selectedImage.value = promptCasePreviewImage(activeCase.value);
}

async function submitGeneration() {
  const generationEvent = currentSubmitGenerationEvent();
  const promptSource = cases.finalPromptSource.value ?? "unknown";
  const caseContext = cases.caseContext.value;
  await generation.submit(
    cases.finalPrompt.value,
    promptSource === "case" ? caseContext?.title : undefined,
    generationEvent
  );
}

async function retryFailedGeneration() {
  const generationEvent = currentSubmitGenerationEvent();
  await generation.retry({
    ...generationEvent,
    metadata: {
      ...generationEvent.metadata,
      isRetry: true,
      retryTrigger: "ai-image"
    }
  });
}

function currentSubmitGenerationEvent() {
  const promptSource = cases.finalPromptSource.value ?? "unknown";
  const caseContext = cases.caseContext.value;
  return buildSubmitGenerationEvent({
    promptSource,
    selectedCaseId: caseContext?.id,
    mode: generation.mode.value,
    size: generation.size.value,
    n: 1,
    referenceImageCount: generation.files.value.length
  });
}

function shouldOpenMobileCaseSheet() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 1535px)").matches;
}

onMounted(() => {
  void cases.load();
});

watch(
  () => [
    cases.selected.value?.id ?? "",
    cases.selectedMode.value,
    cases.finalPromptSource.value ?? "",
    generation.supportedModes.value.join("|"),
    generation.sizeOptions.value.map((option) => option.value).join("|")
  ],
  () => syncCurrentCaseToGeneration(),
  { flush: "post" }
);

watch(
  () => cases.caseContext.value?.id,
  () => {
    if (selectedImage.value?.id.startsWith("case:")) selectedImage.value = null;
  }
);
</script>

<template>
  <AppShell>
    <div class="ai-image-page" :class="{ 'ai-image-page--generating': caseBrowserCollapsed }">
      <section v-if="!caseBrowserCollapsed" class="case-picker-panel panel p-3">
        <div class="case-picker-toolbar">
          <button class="direct-create-entry" type="button" @click="startBlankAssistantFlow">
            <span class="direct-create-icon">
              <WandSparkles class="h-5 w-5" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block text-base font-semibold leading-6">
                {{ t("aiImage.startBlankAssistant") }}
              </span>
              <span class="mt-1 block text-sm leading-5 text-muted-foreground">
                {{ t("aiImage.blankCaseSummary") }}
              </span>
            </span>
            <span class="direct-create-action">
              {{ t("aiImage.startBlankAssistantAction") }}
            </span>
          </button>
          <div class="thin-scrollbar flex min-w-0 gap-2 overflow-x-auto pb-1">
            <button
              class="h-9 shrink-0 rounded-lg border px-3 text-sm font-medium"
              :class="
                !cases.category.value ? 'border-primary bg-primary/10' : 'border-border bg-card'
              "
              type="button"
              @click="cases.category.value = ''"
            >
              {{ t("aiImage.allCategories") }}
            </button>
            <button
              v-for="category in cases.categories.value"
              :key="category"
              class="h-9 shrink-0 rounded-lg border px-3 text-sm font-medium"
              :class="
                cases.category.value === category
                  ? 'border-primary bg-primary/10'
                  : 'border-border bg-card'
              "
              type="button"
              @click="cases.category.value = category"
            >
              {{ category }}
            </button>
          </div>
        </div>
      </section>

      <section v-else class="generation-page-header">
        <div class="flex min-w-0 items-center gap-3">
          <button
            class="ui-button ui-button-secondary h-10 shrink-0 px-4 text-sm"
            type="button"
            :disabled="pageInteractionLocked"
            @click="reopenCaseBrowser"
          >
            <ArrowLeft class="h-4 w-4" />
            {{ t("aiImage.backToCases") }}
          </button>
          <div class="min-w-0">
            <p class="text-xs font-medium text-muted-foreground">
              {{ activeCase ? t("aiImage.selectedCase") : t("aiImage.creationMode") }}
            </p>
            <h1 class="truncate text-lg font-semibold leading-7">{{ selectedCaseTitle }}</h1>
          </div>
        </div>
      </section>

      <div
        class="ai-image-grid"
        :class="caseBrowserCollapsed ? 'ai-image-grid--generating' : 'ai-image-grid--selecting'"
      >
        <PromptCaseGallery
          v-if="!caseBrowserCollapsed"
          :items="cases.filteredItems.value"
          :loading="cases.loading.value"
          :selected-id="cases.selectedId.value"
          @select="selectCase"
        />
        <div v-if="!caseBrowserCollapsed" class="desktop-case-detail">
          <PromptCaseDetail :item="cases.selected.value" @apply="applyCase" />
        </div>
        <AiImagePromptPanel
          v-if="caseBrowserCollapsed"
          v-model:mode="generation.mode.value"
          :active-failed="generation.activeFailed.value"
          :assistant-enabled="auth.promptAssistantEnabled"
          :can-reset-prompt="cases.canResetPrompt.value"
          :case-item="cases.caseContext.value"
          :failed-message="generation.failedMessage.value"
          :failed-title="generation.failedTitle.value"
          :generation-progress="generation.generationProgress.value"
          :generation-prompt="generation.generationPrompt.value"
          :generation-status-label="generation.generationStatusLabel.value"
          :has-running-task="generation.hasRunningTask.value"
          :prompt="cases.finalPrompt.value"
          :previews="generation.previews.value"
          :provider="auth.providerCapabilities"
          :reference-count="generation.files.value.length"
          :result-images="generation.resultImages.value"
          :selected-case-title="selectedCaseTitle"
          :size="generation.size.value"
          :size-fallback-notice="sizeFallbackNotice"
          :size-options="generation.sizeOptions.value"
          :submitting="generation.submitting.value"
          :supported-modes="generation.supportedModes.value"
          :workflow-expanded="caseBrowserCollapsed"
          @add-files="generation.addFiles"
          @clear-prompt="cases.clearPrompt"
          @copy-prompt="copyPrompt"
          @fill-assistant="fillAssistantPrompt"
          @open-assistant="openAssistant"
          @reset-prompt="cases.resetPrompt"
          @update:prompt="(value) => cases.setPrompt(value, 'user')"
          @update:size="setGenerationSize"
          @remove-file="generation.removeFile"
          @retry-failed="retryFailedGeneration"
          @open-image="openGeneratedImage"
          @open-case-preview="openSelectedCasePreview"
          @submit="submitGeneration"
        />
      </div>

      <PromptCaseMobileSheet
        :item="cases.selected.value"
        :open="mobileCaseSheetOpen"
        @apply="applyCase"
        @close="mobileCaseSheetOpen = false"
      />

      <ImageViewer
        :can-delete="false"
        :image="selectedImage"
        :images="viewerImages"
        @close="selectedImage = null"
        @select="selectedImage = $event"
      />
    </div>
  </AppShell>
</template>

<style scoped>
.ai-image-page {
  display: grid;
  container-type: inline-size;
  min-height: calc(100dvh - 6rem);
  gap: 0.75rem;
}

.case-picker-toolbar {
  display: grid;
  min-width: 0;
  gap: 0.75rem;
}

.direct-create-entry {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 0.875rem;
  border-radius: 0.5rem;
  border: 1px solid color-mix(in oklch, var(--primary), transparent 62%);
  background:
    linear-gradient(135deg, color-mix(in oklch, var(--primary), transparent 88%), transparent),
    color-mix(in oklch, var(--card), transparent 10%);
  padding: 0.875rem;
  box-shadow: 0 10px 24px color-mix(in oklch, var(--primary), transparent 88%);
  text-align: left;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;
}

.direct-create-entry:hover {
  border-color: color-mix(in oklch, var(--primary), transparent 35%);
  background: color-mix(in oklch, var(--primary), transparent 88%);
}

.direct-create-entry:active {
  transform: translateY(1px);
}

.direct-create-icon {
  display: inline-flex;
  height: 2.75rem;
  width: 2.75rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: linear-gradient(
    135deg,
    var(--primary),
    color-mix(in oklch, var(--primary), var(--accent) 28%)
  );
  color: var(--primary-foreground);
}

.direct-create-action {
  display: inline-flex;
  min-height: 2.25rem;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: 0.5rem;
  background: var(--primary);
  padding: 0.5rem 0.875rem;
  color: var(--primary-foreground);
  font-size: 0.875rem;
  font-weight: 700;
  white-space: nowrap;
}

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

.ai-image-grid {
  display: grid;
  gap: 1rem;
}

.desktop-case-detail {
  display: none;
}

@media (min-width: 1024px) {
  .ai-image-page {
    height: calc(100dvh - 6rem);
    min-height: 0;
    grid-template-rows: auto minmax(0, 1fr);
  }
}

@container (min-width: 50rem) {
  .ai-image-page--generating {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .case-picker-toolbar {
    grid-template-columns: minmax(21rem, 0.9fr) minmax(0, 1.1fr);
    align-items: stretch;
  }

  .ai-image-grid {
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .ai-image-grid--generating {
    align-items: stretch;
  }

  .ai-image-grid--selecting {
    grid-template-columns: minmax(0, 1fr);
  }

  .ai-image-grid--generating {
    grid-template-columns: minmax(0, 1fr);
  }

  .ai-image-page--generating :deep(.ai-prompt-workspace) {
    height: 100%;
  }

  :deep(.prompt-case-gallery) {
    height: 100%;
    min-height: 0;
    max-height: none;
  }
}

@container (min-width: 96rem) {
  .ai-image-page {
    overflow: hidden;
  }

  .ai-image-grid {
    overflow: hidden;
  }

  .ai-image-grid--selecting {
    grid-template-columns: minmax(30rem, 0.9fr) minmax(32rem, 1.1fr);
  }

  .desktop-case-detail {
    display: block;
    min-height: 0;
    overflow: hidden;
  }

  .ai-image-grid--generating {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

<script setup lang="ts">
/**
 * 面向普通用户的 AI 图像生成页。
 *
 * 页面把“选案例、改 Prompt、提交生成”串成一个轻量流程；真实生图仍复用现有任务链路。
 */
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import ImageViewer from "@/components/image/ImageViewer.vue";
import AiImageCaseBrowser from "./AiImageCaseBrowser.vue";
import AiImageCasePickerPanel from "./AiImageCasePickerPanel.vue";
import AiImageGenerationHeader from "./AiImageGenerationHeader.vue";
import AiImagePromptPanel from "./AiImagePromptPanel.vue";
import PromptCaseMobileSheet from "./PromptCaseMobileSheet.vue";
import { useAuthStore } from "@/stores/auth";
import { resolveAiImageRecommendedSize, type AiImageSizeFallback } from "./aiImageSizeFallback";
import { useAiImageGenerationTracking } from "./useAiImageGenerationTracking";
import { useAiImageCases } from "./useAiImageCases";
import { useAiImageGenerationSubmit } from "./useAiImageGenerationSubmit";
import { promptCasePreviewImage } from "./promptCasePreviewImage";
import type { ImageAttachment } from "@/stores/session";
import type { PromptCase, PromptCaseListItem } from "@/types/promptCases";

const { t } = useI18n();
const route = useRoute();
const router = useRouter();
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
const applyingRouteCaseId = ref<string | null>(null);

const activeCase = computed(() => cases.caseContext.value);
const activeCaseDetail = computed(() => cases.caseContextDetail.value);
const selectedCaseTitle = computed(() => activeCase.value?.title ?? t("aiImage.blankCase"));
const routeCaseId = computed(() =>
  typeof route.params.caseId === "string" ? route.params.caseId : null
);
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

function selectCase(item: PromptCaseListItem | PromptCase) {
  caseBrowserCollapsed.value = false;
  cases.previewCase(item, { userSelected: true });
  mobileCaseSheetOpen.value = shouldOpenMobileCaseSheet();
  trackPromptCaseSelected(item);
}

async function applyCase(item: PromptCaseListItem | PromptCase) {
  const result = await cases.applyCasePrompt(item);
  const detail = cases.caseContextDetail.value;
  if (!detail) return;
  generation.clearActiveResult();
  syncGenerationFromCase(detail, result.mode);
  caseBrowserCollapsed.value = true;
  mobileCaseSheetOpen.value = false;
  if (routeCaseId.value !== detail.id) {
    await router.push({ name: "ai-image-case", params: { caseId: detail.id } });
  }
}

function startBlankAssistantFlow() {
  if (pageInteractionLocked.value) return;
  generation.clearActiveResult();
  cases.startBlankCase();
  sizeFallback.value = null;
  caseBrowserCollapsed.value = true;
  mobileCaseSheetOpen.value = false;
  openAssistant();
}

function reopenCaseBrowser() {
  if (pageInteractionLocked.value) return;
  caseBrowserCollapsed.value = false;
  void router.push("/ai-image");
}

function syncGenerationFromCase(item: PromptCase, mode: PromptCase["modes"][number]) {
  generation.mode.value = mode;
  applyRecommendedSize(item.recommendedSize);
}

function syncCurrentCaseToGeneration() {
  const item = cases.selectedDetail.value;
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
  if (pageInteractionLocked.value || !activeCaseDetail.value) return;
  selectedImage.value = promptCasePreviewImage(activeCaseDetail.value);
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
  return typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
}

onMounted(() => {
  void initializePage();
});

async function initializePage() {
  await cases.load();
  await syncRouteCase();
}

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

watch(routeCaseId, () => {
  void syncRouteCase();
});

async function syncRouteCase() {
  const caseId = routeCaseId.value;
  if (!caseId) {
    if (!pageInteractionLocked.value) caseBrowserCollapsed.value = false;
    applyingRouteCaseId.value = null;
    return;
  }
  if (applyingRouteCaseId.value === caseId) return;
  if (cases.caseContext.value?.id === caseId && caseBrowserCollapsed.value) return;
  applyingRouteCaseId.value = caseId;
  try {
    const result = await cases.applyCasePrompt(caseId, { toastSuccess: false });
    const detail = cases.caseContextDetail.value;
    if (!detail) return;
    generation.clearActiveResult();
    syncGenerationFromCase(detail, result.mode);
    caseBrowserCollapsed.value = true;
    mobileCaseSheetOpen.value = false;
  } catch {
    if (!pageInteractionLocked.value) {
      caseBrowserCollapsed.value = false;
      void router.replace("/ai-image");
    }
  } finally {
    if (applyingRouteCaseId.value === caseId) applyingRouteCaseId.value = null;
  }
}
</script>

<template>
  <AppShell>
    <div class="ai-image-page" :class="{ 'ai-image-page--generating': caseBrowserCollapsed }">
      <AiImageCasePickerPanel
        v-if="!caseBrowserCollapsed"
        :categories="cases.categories.value"
        :category="cases.category.value"
        :filter-mode="cases.filterMode.value"
        :search="cases.search.value"
        :size="cases.size.value"
        :sizes="cases.sizes.value"
        :supported-modes="generation.supportedModes.value"
        @start-blank-assistant-flow="startBlankAssistantFlow"
        @update:category="cases.category.value = $event"
        @update:filter-mode="cases.filterMode.value = $event"
        @update:search="cases.search.value = $event"
        @update:size="cases.size.value = $event"
      />

      <AiImageGenerationHeader
        v-else
        :disabled="pageInteractionLocked"
        :title="selectedCaseTitle"
        @back="reopenCaseBrowser"
      />

      <div
        class="ai-image-grid"
        :class="caseBrowserCollapsed ? 'ai-image-grid--generating' : 'ai-image-grid--selecting'"
      >
        <AiImageCaseBrowser
          v-if="!caseBrowserCollapsed"
          :applying="cases.applying.value"
          :detail-error="cases.detailError.value"
          :detail-item="cases.selectedDetail.value"
          :detail-loading="cases.detailLoading.value"
          :filtered-items="cases.filteredItems.value"
          :has-more="cases.hasMore.value"
          :load-more-error="cases.loadMoreError.value"
          :loading-initial="cases.loadingInitial.value"
          :loading-more="cases.loadingMore.value"
          :selected-id="cases.selectedId.value"
          @apply="(item) => void applyCase(item)"
          @load-more="cases.loadMore"
          @select="selectCase"
        />
        <AiImagePromptPanel
          v-if="caseBrowserCollapsed"
          v-model:mode="generation.mode.value"
          :active-failed="generation.activeFailed.value"
          :assistant-enabled="auth.promptAssistantEnabled"
          :can-reset-prompt="cases.canResetPrompt.value"
          :case-item="activeCaseDetail"
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
        :applying="cases.applying.value"
        :detail-item="cases.selectedDetail.value"
        :error="cases.detailError.value"
        :loading="cases.detailLoading.value"
        :open="mobileCaseSheetOpen"
        @apply="(item) => void applyCase(item)"
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

@container (min-width: 64rem) {
  .ai-image-page {
    overflow: hidden;
  }

  .ai-image-grid {
    overflow: hidden;
  }

  .ai-image-grid--selecting {
    grid-template-columns: minmax(22rem, 0.86fr) minmax(24rem, 0.74fr);
  }

  .desktop-case-detail {
    display: block;
    min-height: 0;
    overflow: hidden;
  }

  .desktop-case-detail :deep(.panel) {
    height: 100%;
    min-height: 0;
  }

  .ai-image-grid--generating {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (min-width: 1024px) {
  .ai-image-grid--selecting {
    grid-template-columns: minmax(22rem, 0.86fr) minmax(24rem, 0.74fr);
  }
}
</style>

<script setup lang="ts">
/**
 * 面向普通用户的 AI 图像生成页。
 *
 * 页面把“选案例、改 Prompt、提交生成”串成一个轻量流程；真实生图仍复用现有任务链路。
 */
import AppShell from "@/components/layout/AppShell.vue";
import ImageViewer from "@/components/image/ImageViewer.vue";
import AiImageCaseBrowser from "./AiImageCaseBrowser.vue";
import AiImageCasePickerPanel from "./AiImageCasePickerPanel.vue";
import AiImageGenerationHeader from "./AiImageGenerationHeader.vue";
import AiImagePromptPanel from "./AiImagePromptPanel.vue";
import PromptCaseMobileSheet from "./PromptCaseMobileSheet.vue";
import { useAiImageGenerationPage } from "./useAiImageGenerationPage";

const {
  activeCaseDetail,
  auth,
  caseBrowserCollapsed,
  cases,
  generation,
  mobileCaseSheetOpen,
  pageInteractionLocked,
  selectedCaseTitle,
  selectedImage,
  sizeFallbackNotice,
  viewerImages,
  applyCase,
  copyPrompt,
  fillAssistantPrompt,
  openAssistant,
  openGeneratedImage,
  openSelectedCasePreview,
  reopenCaseBrowser,
  retryFailedGeneration,
  selectCase,
  setGenerationSize,
  startBlankAssistantFlow,
  submitGeneration
} = useAiImageGenerationPage();
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

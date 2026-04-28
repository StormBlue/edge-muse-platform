<script setup lang="ts">
/**
 * 面向普通用户的 AI 图像生成页。
 *
 * 页面把“选案例、改 Prompt、提交生成”串成一个轻量流程；真实生图仍复用现有任务链路。
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { Maximize2, WandSparkles, X } from "lucide-vue-next";
import AppShell from "@/components/layout/AppShell.vue";
import AiImagePromptPanel from "./AiImagePromptPanel.vue";
import PromptCaseDetail from "./PromptCaseDetail.vue";
import PromptCaseGallery from "./PromptCaseGallery.vue";
import PromptCaseMobileSheet from "./PromptCaseMobileSheet.vue";
import PromptCaseThumbnail from "./PromptCaseThumbnail.vue";
import { useAuthStore } from "@/stores/auth";
import { resolveAiImageRecommendedSize, type AiImageSizeFallback } from "./aiImageSizeFallback";
import { useAiImageExperimentTracking } from "./useAiImageExperimentTracking";
import { useAiImageCases } from "./useAiImageCases";
import { useAiImageGenerationSubmit } from "./useAiImageGenerationSubmit";
import type { PromptCase } from "@/types/promptCases";

const { t } = useI18n();
const auth = useAuthStore();
const generation = useAiImageGenerationSubmit();
const cases = useAiImageCases({ supportedModes: generation.supportedModes });
const {
  directAccess,
  trackPromptCaseSelected,
  trackAssistantStarted,
  trackAssistantPromptFilled,
  buildSubmitExperimentEvent
} = useAiImageExperimentTracking(auth);
const mobileCaseSheetOpen = ref(false);
const caseBrowserCollapsed = ref(false);
const selectedCasePreviewOpen = ref(false);
const sizeFallback = ref<AiImageSizeFallback | null>(null);

const quotaLabel = computed(() => {
  if (!auth.quota) return "--";
  if (auth.quota.remainingQuota === null) return t("common.unlimited");
  return auth.quota.remainingQuota;
});

const activeCase = computed(() => cases.caseContext.value);
const activeCaseThumbnail = computed(() => activeCase.value?.thumbnailUrl ?? null);
const selectedCaseTitle = computed(() => activeCase.value?.title ?? t("aiImage.blankCase"));
const sizeFallbackNotice = computed(() =>
  sizeFallback.value
    ? t("aiImage.sizeFallback", {
        recommended: sizeFallback.value.recommendedSize,
        size: sizeFallback.value.actualSize
      })
    : ""
);
const providerLabel = computed(() => {
  const capabilities = auth.providerCapabilities;
  if (!capabilities) return t("aiImage.providerUnknown");
  return `${capabilities.providerName} · ${capabilities.model} · ${generation.status.value}`;
});

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
  cases.startBlankCase();
  sizeFallback.value = null;
  caseBrowserCollapsed.value = true;
  mobileCaseSheetOpen.value = false;
  closeSelectedCasePreview();
  openAssistant();
}

function reopenCaseBrowser() {
  caseBrowserCollapsed.value = false;
  closeSelectedCasePreview();
}

function closeSelectedCasePreview() {
  selectedCasePreviewOpen.value = false;
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

async function submitGeneration() {
  const experimentEvent = currentSubmitExperimentEvent();
  const promptSource = cases.finalPromptSource.value ?? "unknown";
  const caseContext = cases.caseContext.value;
  await generation.submit(
    cases.finalPrompt.value,
    promptSource === "case" ? caseContext?.title : undefined,
    experimentEvent
  );
}

async function retryFailedGeneration() {
  const experimentEvent = currentSubmitExperimentEvent();
  await generation.retry({
    ...experimentEvent,
    metadata: {
      ...experimentEvent.metadata,
      isRetry: true,
      retryTrigger: "ai-image"
    }
  });
}

function currentSubmitExperimentEvent() {
  const promptSource = cases.finalPromptSource.value ?? "unknown";
  const caseContext = cases.caseContext.value;
  return buildSubmitExperimentEvent({
    promptSource,
    selectedCaseId: caseContext?.id,
    mode: generation.mode.value,
    size: generation.size.value,
    n: 1,
    referenceImageCount: generation.files.value.length,
    directAccess: directAccess.value
  });
}

function shouldOpenMobileCaseSheet() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 1535px)").matches;
}

function onSelectedCasePreviewKeydown(event: KeyboardEvent) {
  if (event.key !== "Escape" || !selectedCasePreviewOpen.value) return;
  closeSelectedCasePreview();
}

onMounted(() => {
  window.addEventListener("keydown", onSelectedCasePreviewKeydown);
  void cases.load();
});

onBeforeUnmount(() => window.removeEventListener("keydown", onSelectedCasePreviewKeydown));

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
    closeSelectedCasePreview();
  }
);
</script>

<template>
  <AppShell>
    <div class="ai-image-page" :class="{ 'ai-image-page--generating': caseBrowserCollapsed }">
      <section v-if="!caseBrowserCollapsed" class="panel p-3">
        <div class="flex min-w-0 flex-col gap-3 2xl:flex-row 2xl:items-center 2xl:justify-between">
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
          <div class="flex shrink-0 flex-wrap gap-2 text-sm">
            <button
              class="ui-button ui-button-secondary h-9 shrink-0 text-xs"
              type="button"
              @click="startBlankAssistantFlow"
            >
              <WandSparkles class="h-3.5 w-3.5" />
              {{ t("aiImage.startBlankAssistant") }}
            </button>
            <span class="rounded-full border border-border px-3 py-1.5 text-muted-foreground">
              {{ t("common.quota") }}:
              {{ quotaLabel }}
            </span>
            <span class="rounded-full border border-border px-3 py-1.5 text-muted-foreground">
              {{ providerLabel }}
            </span>
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
        <section v-else class="case-browser-collapsed panel">
          <button
            v-if="activeCaseThumbnail"
            class="group relative aspect-[4/3] w-full overflow-hidden rounded-lg border border-border bg-muted"
            type="button"
            :title="t('aiImage.openCasePreview')"
            @click="selectedCasePreviewOpen = true"
          >
            <PromptCaseThumbnail
              :src="activeCaseThumbnail"
              :alt="selectedCaseTitle"
              icon-class="h-6 w-6"
            />
            <span
              class="absolute right-2 top-2 inline-flex h-7 w-7 items-center justify-center rounded-md bg-background/85 text-foreground opacity-0 transition group-hover:opacity-100"
            >
              <Maximize2 class="h-3.5 w-3.5" />
            </span>
          </button>
          <div
            v-else
            class="flex aspect-[4/3] w-full items-center justify-center rounded-lg border border-dashed border-border bg-muted/35 text-muted-foreground"
          >
            <WandSparkles class="h-7 w-7" />
          </div>
          <p class="mt-3 text-xs font-medium text-muted-foreground">
            {{ activeCase ? t("aiImage.selectedCase") : t("aiImage.creationMode") }}
          </p>
          <p class="mt-1 truncate text-sm font-semibold">{{ selectedCaseTitle }}</p>
          <p class="mt-2 line-clamp-2 text-xs leading-5 text-muted-foreground">
            {{ activeCase?.promptSummary || t("aiImage.blankCaseSummary") }}
          </p>
          <button
            class="ui-button ui-button-secondary mt-3 h-8 w-full text-xs"
            type="button"
            @click="reopenCaseBrowser"
          >
            {{ t("aiImage.changeCase") }}
          </button>
        </section>

        <AiImagePromptPanel
          v-model:mode="generation.mode.value"
          :active-failed="generation.activeFailed.value"
          :assistant-enabled="auth.promptAssistantEnabled"
          :case-item="cases.caseContext.value"
          :failed-message="generation.failedMessage.value"
          :failed-title="generation.failedTitle.value"
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
          @update:prompt="(value) => cases.setPrompt(value, 'user')"
          @update:size="setGenerationSize"
          @remove-file="generation.removeFile"
          @retry-failed="retryFailedGeneration"
          @submit="submitGeneration"
        />
      </div>

      <PromptCaseMobileSheet
        :item="cases.selected.value"
        :open="mobileCaseSheetOpen"
        @apply="applyCase"
        @close="mobileCaseSheetOpen = false"
      />

      <Teleport to="body">
        <div
          v-if="activeCase && activeCaseThumbnail && selectedCasePreviewOpen"
          class="fixed inset-0 z-50 grid grid-rows-[auto_minmax(0,1fr)] bg-black/90 text-white"
          role="dialog"
          aria-modal="true"
          @click.self="closeSelectedCasePreview"
        >
          <header
            class="flex min-h-14 items-center justify-between gap-3 border-b border-white/10 px-4 py-2"
          >
            <div class="min-w-0">
              <p class="truncate text-sm font-semibold">{{ selectedCaseTitle }}</p>
              <p class="truncate text-xs text-white/65">
                {{ activeCase.category }} · {{ activeCase.recommendedSize }}
              </p>
            </div>
            <button
              class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 text-white hover:bg-white/18"
              type="button"
              :title="t('viewer.close')"
              @click="closeSelectedCasePreview"
            >
              <X class="h-4 w-4" />
            </button>
          </header>
          <main class="min-h-0 overflow-auto p-4" @click.self="closeSelectedCasePreview">
            <div class="flex min-h-full items-center justify-center">
              <img
                class="max-h-[calc(100dvh-6rem)] max-w-full rounded-lg object-contain shadow-2xl shadow-black/50"
                :src="activeCaseThumbnail"
                :alt="selectedCaseTitle"
              />
            </div>
          </main>
        </div>
      </Teleport>
    </div>
  </AppShell>
</template>

<style scoped>
.ai-image-page {
  display: grid;
  container-type: inline-size;
  min-height: calc(100dvh - 6rem);
  gap: 0.875rem;
}

.ai-image-grid {
  display: grid;
  gap: 1rem;
}

.case-browser-collapsed {
  align-self: start;
  display: flex;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  padding: 1rem;
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
    grid-template-rows: minmax(0, 1fr);
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
    grid-template-columns: minmax(15rem, 19rem) minmax(0, 1fr);
  }

  .ai-image-grid--generating {
    grid-template-columns: 16rem minmax(0, 1fr);
  }

  .ai-image-page--generating :deep(.ai-prompt-workspace) {
    height: 100%;
  }

  :deep(.prompt-case-gallery) {
    height: 100%;
    min-height: 0;
    max-height: none;
  }

  .case-browser-collapsed {
    min-height: 0;
    max-height: 100%;
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
    grid-template-columns: 21rem minmax(25rem, 0.9fr) minmax(42rem, 1.1fr);
  }

  .desktop-case-detail {
    display: block;
    min-height: 0;
    overflow: hidden;
  }

  .ai-image-grid--generating {
    grid-template-columns: 17rem minmax(0, 1fr);
  }
}
</style>

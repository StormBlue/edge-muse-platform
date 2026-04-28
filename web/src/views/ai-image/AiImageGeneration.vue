<script setup lang="ts">
/**
 * 面向普通用户的 AI 图像生成页。
 *
 * 页面把“选案例、改 Prompt、提交生成”串成一个轻量流程；真实生图仍复用现有任务链路。
 */
import { computed, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import AppShell from "@/components/layout/AppShell.vue";
import AiImagePromptPanel from "./AiImagePromptPanel.vue";
import PromptCaseDetail from "./PromptCaseDetail.vue";
import PromptCaseGallery from "./PromptCaseGallery.vue";
import PromptCaseMobileSheet from "./PromptCaseMobileSheet.vue";
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
  trackAssistantPromptFilled,
  buildSubmitExperimentEvent
} = useAiImageExperimentTracking(auth);
const mobileCaseSheetOpen = ref(false);
const sizeFallback = ref<AiImageSizeFallback | null>(null);

const quotaLabel = computed(() => {
  if (!auth.quota) return "--";
  if (auth.quota.remainingQuota === null) return t("common.unlimited");
  return auth.quota.remainingQuota;
});

const selectedCaseTitle = computed(() => cases.selected.value?.title ?? t("aiImage.blankCase"));
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
  const result = cases.selectCase(item);
  syncGenerationFromCase(item, result.mode);
  mobileCaseSheetOpen.value = shouldOpenMobileCaseSheet();
  trackPromptCaseSelected(item);
}

function applyCase(item: PromptCase) {
  const result = cases.applyCasePrompt(item);
  syncGenerationFromCase(item, result.mode);
  mobileCaseSheetOpen.value = false;
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

function fillAssistantPrompt(value: { prompt: string; recommendedSize: string }) {
  cases.setPrompt(value.prompt, "assistant");
  applyRecommendedSize(value.recommendedSize);
  trackAssistantPromptFilled(cases.selected.value?.id, value.prompt);
}

async function submitGeneration() {
  const promptSource = cases.finalPromptSource.value ?? "unknown";
  const selected = cases.selected.value;
  const experimentEvent = buildSubmitExperimentEvent({
    promptSource,
    selectedCaseId: selected?.id,
    mode: generation.mode.value,
    size: generation.size.value,
    referenceImageCount: generation.files.value.length,
    directAccess: directAccess.value
  });
  await generation.submit(
    cases.finalPrompt.value,
    promptSource === "case" ? selected?.title : undefined,
    experimentEvent
  );
}

function shouldOpenMobileCaseSheet() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 1279px)").matches;
}

onMounted(async () => {
  await cases.load();
});

watch(
  () => [
    cases.selected.value?.id ?? "",
    cases.selectedMode.value,
    generation.supportedModes.value.join("|"),
    generation.sizeOptions.value.map((option) => option.value).join("|")
  ],
  () => syncCurrentCaseToGeneration(),
  { flush: "post" }
);
</script>

<template>
  <AppShell>
    <div class="ai-image-page">
      <header class="panel flex flex-wrap items-center justify-between gap-3 p-4">
        <div>
          <h1 class="text-xl font-semibold">{{ t("nav.aiImage") }}</h1>
          <p class="mt-1 text-sm text-muted-foreground">{{ t("aiImage.subtitle") }}</p>
        </div>
        <div class="flex flex-wrap gap-2 text-sm">
          <span class="rounded-full border border-border px-3 py-1.5 text-muted-foreground">
            {{ t("common.quota") }}:
            {{ quotaLabel }}
          </span>
          <span class="rounded-full border border-border px-3 py-1.5 text-muted-foreground">
            {{ providerLabel }}
          </span>
        </div>
      </header>

      <section class="panel p-3">
        <div class="thin-scrollbar flex gap-2 overflow-x-auto pb-1">
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
        <div class="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_12rem_12rem]">
          <input
            v-model="cases.search.value"
            class="ui-field h-10 px-3 text-sm"
            :placeholder="t('aiImage.searchCases')"
          />
          <select v-model="cases.filterMode.value" class="ui-field h-10 px-3 text-sm">
            <option value="">{{ t("promptCases.allModes") }}</option>
            <option
              v-if="generation.supportedModes.value.includes('text2image')"
              value="text2image"
            >
              {{ t("workspace.text2image") }}
            </option>
            <option
              v-if="generation.supportedModes.value.includes('image2image')"
              value="image2image"
            >
              {{ t("workspace.image2image") }}
            </option>
          </select>
          <select v-model="cases.size.value" class="ui-field h-10 px-3 text-sm">
            <option value="">{{ t("aiImage.allSizes") }}</option>
            <option v-for="size in cases.sizes.value" :key="size" :value="size">
              {{ size }}
            </option>
          </select>
        </div>
      </section>

      <div class="ai-image-grid">
        <PromptCaseGallery
          :items="cases.filteredItems.value"
          :loading="cases.loading.value"
          :selected-id="cases.selectedId.value"
          @select="selectCase"
        />
        <div class="desktop-case-detail">
          <PromptCaseDetail :item="cases.selected.value" @apply="applyCase" />
        </div>

        <AiImagePromptPanel
          v-model:mode="generation.mode.value"
          :case-item="cases.selected.value"
          :direct-access="directAccess"
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
          @add-files="generation.addFiles"
          @clear-prompt="cases.clearPrompt"
          @copy-prompt="copyPrompt"
          @fill-assistant="fillAssistantPrompt"
          @update:prompt="(value) => cases.setPrompt(value, 'user')"
          @update:size="setGenerationSize"
          @remove-file="generation.removeFile"
          @submit="submitGeneration"
        />
      </div>

      <PromptCaseMobileSheet
        :item="cases.selected.value"
        :open="mobileCaseSheetOpen"
        @apply="applyCase"
        @close="mobileCaseSheetOpen = false"
      />
    </div>
  </AppShell>
</template>

<style scoped>
.ai-image-page {
  display: grid;
  min-height: calc(100dvh - 6rem);
  gap: 1rem;
}

.ai-image-grid {
  display: grid;
  gap: 1rem;
}

.desktop-case-detail {
  display: none;
}

@media (min-width: 1280px) {
  .ai-image-page {
    height: calc(100dvh - 6rem);
    grid-template-rows: auto auto minmax(0, 1fr);
    overflow: hidden;
  }

  .ai-image-grid {
    min-height: 0;
    grid-template-columns: 22rem minmax(0, 1fr) 25rem;
    overflow: hidden;
  }

  .desktop-case-detail {
    display: block;
    min-height: 0;
    overflow: hidden;
  }
}
</style>

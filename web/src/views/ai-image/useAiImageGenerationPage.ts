import { computed, onMounted, onScopeDispose, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { useI18n } from "vue-i18n";
import { useAuthStore } from "@/stores/auth";
import { resolveAiImageRecommendedSize, type AiImageSizeFallback } from "./aiImageSizeFallback";
import { useAiImageCases } from "./useAiImageCases";
import { useAiImageGenerationSubmit } from "./useAiImageGenerationSubmit";
import { useAiImageGenerationTracking } from "./useAiImageGenerationTracking";
import { promptCasePreviewImage } from "./promptCasePreviewImage";
import type { ImageAttachment } from "@/stores/session";
import type { PromptCase, PromptCaseListItem } from "@/types/promptCases";

export function useAiImageGenerationPage() {
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
  let routeRequest = 0;
  let disposed = false;
  let appliedCaseId: string | null = null;
  onScopeDispose(() => {
    disposed = true;
    routeRequest += 1;
  });

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

  onMounted(() => {
    void initializePage();
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

  watch([routeCaseId, () => route.query.mode, pageInteractionLocked], () => {
    void syncRouteCase();
  });

  function selectCase(item: PromptCaseListItem | PromptCase) {
    if (pageInteractionLocked.value) return;
    caseBrowserCollapsed.value = false;
    cases.previewCase(item, { userSelected: true });
    mobileCaseSheetOpen.value = shouldOpenMobileCaseSheet();
    trackPromptCaseSelected(item);
  }

  async function applyCase(item: PromptCaseListItem | PromptCase) {
    if (pageInteractionLocked.value) return;
    const request = ++routeRequest;
    const isCurrent = () => !disposed && request === routeRequest && !pageInteractionLocked.value;
    let result;
    try {
      result = await cases.applyCasePrompt(item, { isCurrent });
    } catch {
      return;
    }
    if (!result || !isCurrent()) return;
    const detail = cases.caseContextDetail.value;
    if (!detail) return;
    generation.clearActiveResult();
    syncGenerationFromCase(detail, result.mode);
    appliedCaseId = detail.id;
    caseBrowserCollapsed.value = true;
    mobileCaseSheetOpen.value = false;
    if (routeCaseId.value !== detail.id) {
      await router.push({ name: "ai-image-case", params: { caseId: detail.id } });
    }
  }

  function startBlankAssistantFlow() {
    if (pageInteractionLocked.value) return;
    routeRequest += 1;
    appliedCaseId = null;
    generation.clearActiveResult();
    cases.startBlankCase();
    sizeFallback.value = null;
    caseBrowserCollapsed.value = true;
    mobileCaseSheetOpen.value = false;
    void router.push({ path: "/ai-image", query: { mode: "blank" } });
    openAssistant();
  }

  function reopenCaseBrowser() {
    if (pageInteractionLocked.value) return;
    caseBrowserCollapsed.value = false;
    routeRequest += 1;
    if (window.history.state?.back === "/ai-image") router.back();
    else void router.replace("/ai-image");
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

  async function initializePage() {
    await cases.load();
    await syncRouteCase();
  }

  async function syncRouteCase() {
    const request = ++routeRequest;
    if (disposed || pageInteractionLocked.value) return;
    const caseId = routeCaseId.value;
    if (!caseId) {
      if (route.query.mode === "blank" && appliedCaseId !== null) {
        cases.startBlankCase();
        appliedCaseId = null;
        sizeFallback.value = null;
      }
      caseBrowserCollapsed.value = route.query.mode === "blank";
      applyingRouteCaseId.value = null;
      return;
    }
    if (appliedCaseId === caseId && cases.caseContext.value?.id === caseId) {
      caseBrowserCollapsed.value = true;
      return;
    }
    applyingRouteCaseId.value = caseId;
    try {
      const isCurrent = () =>
        !disposed &&
        request === routeRequest &&
        routeCaseId.value === caseId &&
        !pageInteractionLocked.value;
      const result = await cases.applyCasePrompt(caseId, { toastSuccess: false, isCurrent });
      if (!result || !isCurrent()) return;
      const detail = cases.caseContextDetail.value;
      if (!detail) return;
      generation.clearActiveResult();
      syncGenerationFromCase(detail, result.mode);
      appliedCaseId = caseId;
      caseBrowserCollapsed.value = true;
      mobileCaseSheetOpen.value = false;
    } catch {
      if (!disposed && request === routeRequest && !pageInteractionLocked.value) {
        caseBrowserCollapsed.value = false;
        void router.replace("/ai-image");
      }
    } finally {
      if (applyingRouteCaseId.value === caseId) applyingRouteCaseId.value = null;
    }
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

  function syncGenerationFromCase(item: PromptCase, mode: PromptCase["modes"][number]) {
    generation.mode.value = mode;
    applyRecommendedSize(item.recommendedSize);
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

  function currentSubmitGenerationEvent() {
    const promptSource = cases.finalPromptSource.value ?? "unknown";
    const caseContext = cases.caseContext.value;
    return buildSubmitGenerationEvent({
      promptSource,
      selectedCaseId: caseContext?.id,
      mode: generation.mode.value,
      size: generation.size.value,
      n: 1,
      generationTargetId: generation.generationTargetId.value,
      referenceImageCount: generation.files.value.length
    });
  }

  return {
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
  };
}

function shouldOpenMobileCaseSheet() {
  return typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
}

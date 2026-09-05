/**
 * 创作器只拥有当前编辑状态与选中的结果，不再借用工作台的 currentSessionId。
 * 服务端任务可从 URL 恢复；未提交内容仅在当前页面内存保留，遵守本次不做草稿持久化的范围。
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import { getTask, type GenerationTask } from "@/api/tasks";
import { useAuthStore } from "@/stores/auth";
import { useTaskActivityStore } from "@/stores/taskActivity";
import { useTaskWebSocket } from "@/composables/useTaskWebSocket";
import type { ImageAttachment } from "@/stores/session";
import type { PromptCase, PromptCaseListItem, PromptCaseMode } from "@/types/promptCases";
import {
  generationTargetDisplayLabel,
  generationTargetsWithFallback
} from "@/utils/generationTargets";
import { prepareReferenceImageFiles, imageFilesFromFileList } from "@/utils/referenceImageFiles";
import { useAiImageCases } from "./useAiImageCases";
import { useAiImageGenerationTracking } from "./useAiImageGenerationTracking";
import { resolveAiImageRecommendedSize } from "./aiImageSizeFallback";
import { studioMessages } from "./studioMessages";
import {
  emptyCreativeBrief,
  formatCreativeBrief,
  mergeStudioTask,
  studioConcurrentLimit,
  studioImageLimit,
  studioSizeOptions,
  studioTaskImages,
  studioSubmitIssue
} from "./studioForm";

export type StudioReference = {
  key: string;
  url: string;
  name: string;
  file?: File;
  image?: ImageAttachment;
};

export function useImageStudio() {
  const { t } = useI18n({ messages: studioMessages, missingWarn: false, fallbackWarn: false });
  const route = useRoute();
  const router = useRouter();
  const auth = useAuthStore();
  const activity = useTaskActivityStore();
  const prompt = ref("");
  const undoPrompt = ref<string | null>(null);
  const brief = ref(emptyCreativeBrief());
  const mode = ref<PromptCaseMode>("text2image");
  const targetId = ref("default");
  const size = ref("auto");
  const count = ref(1);
  const references = ref<StudioReference[]>([]);
  const editorTab = ref<"editor" | "assistant">("editor");
  const mobileTab = ref<"create" | "results">("create");
  const casePickerOpen = ref(false);
  const currentTask = ref<GenerationTask | null>(null);
  const sourceTask = ref<GenerationTask | null>(null);
  const comparisonSourceTask = ref<GenerationTask | null>(null);
  const restoredReferenceCount = ref(0);
  const sourceImageId = ref<string | null>(null);
  const selectedImageId = ref<string | null>(null);
  const comparisonImageId = ref<string | null>(null);
  const comparing = ref(false);
  const viewerImage = ref<ImageAttachment | null>(null);
  const submitting = ref(false);
  const preparingReferences = ref(false);
  const submitPhase = ref("submitting");
  const loadingTask = ref(false);
  const error = ref("");
  const notice = ref("");
  let disposed = false;
  let routeVersion = 0;
  let referenceVersion = 0;
  let formVersion = 0;
  let submissionVersion = 0;
  let loadedRouteKey = "";
  let appliedCaseId: string | null = null;
  let detailInFlight = false;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const targets = computed(() =>
    generationTargetsWithFallback(auth.generationTargets, auth.providerCapabilities).map(
      (item) => ({ ...item, label: generationTargetDisplayLabel(item, t) })
    )
  );
  const provider = computed(
    () =>
      targets.value.find((item) => item.id === targetId.value)?.providerCapabilities ??
      auth.providerCapabilities
  );
  const supportedModes = computed<PromptCaseMode[]>(() => provider.value?.supportedModes ?? []);
  const sizeOptions = computed(() => studioSizeOptions(provider.value, mode.value));
  const referenceLimit = computed(() =>
    Math.min(5, Math.max(0, provider.value?.maxReferenceImages ?? 5))
  );
  const imageLimit = computed(() => studioImageLimit(auth.user));
  const cases = useAiImageCases({ supportedModes });
  const tracking = useAiImageGenerationTracking();
  const activeCase = computed(() => cases.caseContextDetail.value);
  const briefText = computed(() => formatCreativeBrief(brief.value, (key) => t(`studio.${key}`)));
  const referenceDescription = computed(() =>
    [brief.value.preserve, brief.value.changes].filter(Boolean).join("\n")
  );
  const referenceContextKey = computed(() => references.value.map((item) => item.key).join("|"));
  const images = computed(() => studioTaskImages(currentTask.value));
  const selectedImage = computed(
    () =>
      images.value.find((image) => image.id === selectedImageId.value) ?? images.value[0] ?? null
  );
  const comparisonImages = computed(() => {
    const all = [
      ...(currentTask.value?.referenceImages ?? []).map((image, index) => ({
        ...image,
        displayName: `${t("studio.references")} · ${index + 1}`,
        model: "",
        size: ""
      })),
      ...studioTaskImages(comparisonSourceTask.value),
      ...studioTaskImages(sourceTask.value),
      ...images.value,
      ...activity.items.flatMap(studioTaskImages)
    ];
    const unique = new Map(all.map((image) => [image.id, image]));
    return [...unique.values()].filter((image) => image.id !== selectedImage.value?.id);
  });
  const comparisonImage = computed(
    () =>
      comparisonImages.value.find((image) => image.id === comparisonImageId.value) ??
      comparisonImages.value[0] ??
      null
  );
  const isRunning = computed(
    () => currentTask.value?.status === "queued" || currentTask.value?.status === "running"
  );
  const missingReferences = computed(() =>
    mode.value === "image2image"
      ? Math.max(0, restoredReferenceCount.value - references.value.length)
      : 0
  );
  const issue = computed(() =>
    missingReferences.value
      ? "referencesMissing"
      : studioSubmitIssue({
          prompt: prompt.value,
          mode: mode.value,
          supportedModes: supportedModes.value,
          size: size.value,
          sizes: sizeOptions.value,
          count: count.value,
          countLimit: imageLimit.value,
          referenceCount: references.value.length,
          referenceLimit: referenceLimit.value,
          remaining: auth.quota?.remainingQuota ?? null,
          activeCount: activity.activeCount,
          concurrentLimit: studioConcurrentLimit(auth.user)
        })
  );
  const issueMessage = computed(() => {
    if (!issue.value) return "";
    const common: Record<string, string> = {
      empty_prompt: "workspace.emptyPrompt",
      size_unsupported: "workspace.sizeUnsupported",
      reference_required: "workspace.referenceRequired"
    };
    return t(common[issue.value] ?? `studio.${issue.value}`);
  });
  const canSubmit = computed(
    () => !issue.value && !submitting.value && !preparingReferences.value && !loadingTask.value
  );

  // 全局快照只更新本页已选中的任务，不会将用户切换到其它正在运行的任务。
  watch(
    () => activity.items,
    (items) => {
      const next = items.find((item) => item.id === currentTask.value?.id);
      if (next) currentTask.value = mergeStudioTask(currentTask.value, next);
    }
  );
  watch(
    () => targets.value.map((target) => target.id).join("|"),
    () => {
      if (!targets.value.some((target) => target.id === targetId.value))
        targetId.value = targets.value[0]?.id ?? "default";
    },
    { immediate: true }
  );
  watch(
    supportedModes,
    (modes) => {
      if (!modes.includes(mode.value)) mode.value = modes[0] ?? "text2image";
    },
    { immediate: true }
  );
  watch(
    sizeOptions,
    (options) => {
      if (!options.some((option) => option.value === size.value))
        size.value = options[0]?.value ?? "auto";
    },
    { immediate: true }
  );
  watch(imageLimit, (limit) => {
    count.value = Math.min(count.value, limit);
  });
  watch(
    [prompt, targetId, mode, size, count, brief],
    () => {
      formVersion += 1;
    },
    { deep: true, flush: "sync" }
  );

  const socket = useTaskWebSocket(() => {
    if (refreshTimer) return;
    // 多图增量事件合并拉取，避免每张图片触发一组重复请求。
    refreshTimer = setTimeout(() => {
      refreshTimer = null;
      void refreshCurrentTask();
    }, 250);
  });
  watch(
    () => [currentTask.value?.id, isRunning.value] as const,
    ([id, running]) => {
      socket.disconnect();
      if (id && running) socket.connect(`/ws/task/${encodeURIComponent(id)}`);
    }
  );

  function replacePrompt(value: string) {
    undoPrompt.value = prompt.value;
    prompt.value = value;
  }
  function undo() {
    if (undoPrompt.value === null) return;
    const value = prompt.value;
    prompt.value = undoPrompt.value;
    undoPrompt.value = value;
  }
  function addBriefToPrompt() {
    if (!briefText.value) {
      toast.error(t("studio.briefEmpty"));
      return;
    }
    const next = [prompt.value.trim(), briefText.value].filter(Boolean).join("\n\n");
    if (next.length > 4000) {
      toast.error(t("studio.promptTooLong"));
      return;
    }
    replacePrompt(next);
  }
  function applyAssistant(value: { prompt: string; recommendedSize: string; turnCount: number }) {
    replacePrompt(value.prompt);
    if (value.recommendedSize) setRecommendedSize(value.recommendedSize);
    tracking.trackAssistantPromptFilled({
      caseId: activeCase.value?.id,
      prompt: value.prompt,
      turnCount: value.turnCount
    });
    editorTab.value = "editor";
  }
  function clearReferences() {
    referenceVersion += 1;
    for (const reference of references.value)
      if (reference.file) URL.revokeObjectURL(reference.url);
    references.value = [];
  }
  function removeReference(index: number) {
    const reference = references.value[index];
    if (reference?.file) URL.revokeObjectURL(reference.url);
    references.value.splice(index, 1);
    formVersion += 1;
  }
  async function addFiles(input: File[] | FileList) {
    if (submitting.value || preparingReferences.value || mode.value !== "image2image") return;
    const version = referenceVersion;
    preparingReferences.value = true;
    try {
      const files = await prepareReferenceImageFiles(imageFilesFromFileList(input));
      if (disposed || version !== referenceVersion) return;
      const available = Math.max(0, referenceLimit.value - references.value.length);
      if (files.length > available) toast.error(t("studio.referencesExceeded"));
      for (const file of files.slice(0, available))
        references.value.push({
          key: crypto.randomUUID(),
          file,
          url: URL.createObjectURL(file),
          name: file.name
        });
      formVersion += 1;
    } finally {
      if (version === referenceVersion) preparingReferences.value = false;
    }
  }
  function setRecommendedSize(value: string) {
    const resolved = resolveAiImageRecommendedSize(value, sizeOptions.value, size.value);
    size.value = resolved.size;
    if (resolved.fallback) notice.value = t("studio.capabilityChanged");
  }
  async function openCases() {
    casePickerOpen.value = true;
    await cases.load();
  }
  async function applyCase(
    item: PromptCase | PromptCaseListItem | string,
    navigate = true,
    expectedVersion?: number
  ) {
    if (submitting.value) return;
    const version = expectedVersion ?? ++routeVersion;
    const editVersion = formVersion;
    const result = await cases.applyCasePrompt(item, {
      toastSuccess: false,
      isCurrent: () => !disposed && version === routeVersion && editVersion === formVersion
    });
    if (!result || version !== routeVersion || disposed) return;
    replacePrompt(result.prompt);
    mode.value = result.mode;
    const detail = cases.caseContextDetail.value;
    if (detail) setRecommendedSize(detail.recommendedSize);
    appliedCaseId = detail?.id ?? null;
    sourceTask.value = null;
    sourceImageId.value = null;
    restoredReferenceCount.value = 0;
    casePickerOpen.value = false;
    mobileTab.value = "create";
    if (detail) tracking.trackPromptCaseSelected(detail);
    if (navigate && detail)
      await router.push({ name: "ai-image-case", params: { caseId: detail.id } });
  }
  async function newCreation() {
    if (submitting.value) return;
    routeVersion += 1;
    prompt.value = "";
    undoPrompt.value = null;
    brief.value = emptyCreativeBrief();
    clearReferences();
    cases.startBlankCase();
    appliedCaseId = null;
    mode.value = supportedModes.value.includes("text2image")
      ? "text2image"
      : (supportedModes.value[0] ?? "text2image");
    count.value = 1;
    currentTask.value = null;
    sourceTask.value = null;
    sourceImageId.value = null;
    restoredReferenceCount.value = 0;
    comparisonSourceTask.value = null;
    selectedImageId.value = null;
    comparing.value = false;
    error.value = "";
    notice.value = "";
    mobileTab.value = "create";
    editorTab.value = "editor";
    await router.push({ path: "/ai-image", query: { mode: "blank" } });
  }
  async function reuseTask(task: GenerationTask, asReference = false, image?: ImageAttachment) {
    if (submitting.value) return;
    const selected = image ?? task.images[0];
    const requestedTarget = task.params.generationTargetId ?? "default";
    const nextTarget =
      targets.value.find((target) => target.id === requestedTarget) ?? targets.value[0];
    if (!nextTarget) {
      error.value = t("studio.noCapabilities");
      return;
    }
    const nextMode = asReference ? "image2image" : task.params.mode;
    if (
      asReference &&
      (!selected || !nextTarget.providerCapabilities.supportedModes.includes("image2image"))
    ) {
      error.value = t(selected ? "studio.unsupportedReference" : "studio.sourceMissing");
      return;
    }
    clearReferences();
    cases.startBlankCase();
    appliedCaseId = null;
    replacePrompt(task.prompt);
    targetId.value = nextTarget.id;
    mode.value = nextTarget.providerCapabilities.supportedModes.includes(nextMode)
      ? nextMode
      : (nextTarget.providerCapabilities.supportedModes[0] ?? "text2image");
    const availableSizes = studioSizeOptions(nextTarget.providerCapabilities, mode.value);
    size.value = availableSizes.some((option) => option.value === task.params.size)
      ? task.params.size
      : (availableSizes[0]?.value ?? "auto");
    count.value = Math.min(task.params.n, imageLimit.value);
    const sourceReferences = asReference ? [selected!] : (task.referenceImages ?? []);
    // 被删除的原参考图不会出现在附件投影中，必须补齐或由用户明确接受减少后的引用集合。
    restoredReferenceCount.value = asReference
      ? 1
      : (task.params.referenceImageIds?.length ?? sourceReferences.length);
    references.value = sourceReferences.map((reference) => ({
      key: reference.id,
      image: reference,
      url: reference.url,
      name: reference.displayName ?? reference.id
    }));
    sourceTask.value = task;
    sourceImageId.value = asReference ? selected!.id : null;
    comparisonImageId.value = selected?.id ?? null;
    currentTask.value = task;
    error.value = "";
    notice.value =
      nextTarget.id !== requestedTarget ||
      size.value !== task.params.size ||
      mode.value !== nextMode ||
      count.value !== task.params.n ||
      (task.params.model && task.params.model !== nextTarget.providerCapabilities.model)
        ? t("studio.capabilityChanged")
        : t(asReference ? "studio.referenceLoaded" : "studio.sourceLoaded");
    mobileTab.value = "create";
    editorTab.value = "editor";
  }
  async function reuseCurrent(asReference: boolean) {
    if (!currentTask.value) return;
    if (
      route.query.sourceTask === currentTask.value.id &&
      route.query.reuse === (asReference ? "reference" : "params") &&
      (!asReference || route.query.image === selectedImage.value?.id)
    ) {
      await reuseTask(currentTask.value, asReference, selectedImage.value ?? undefined);
      return;
    }
    await router.push({
      path: "/ai-image",
      query: {
        mode: "blank",
        sourceTask: currentTask.value.id,
        reuse: asReference ? "reference" : "params",
        ...(asReference && selectedImage.value ? { image: selectedImage.value.id } : {})
      }
    });
  }
  async function refreshCurrentTask() {
    const id = currentTask.value?.id;
    if (!id || detailInFlight) return;
    detailInFlight = true;
    try {
      const task = await getTask(id);
      if (!disposed && currentTask.value?.id === id)
        currentTask.value = mergeStudioTask(currentTask.value, task);
    } catch {
      /* 全局任务中心负责离线提示；暂时失败保留已显示结果。 */
    } finally {
      detailInFlight = false;
    }
  }
  async function submit() {
    if (!canSubmit.value) return;
    const userId = auth.user?.id;
    const request = ++submissionVersion;
    const viewVersion = routeVersion;
    const isCurrent = () =>
      !disposed &&
      auth.user?.id === userId &&
      request === submissionVersion &&
      viewVersion === routeVersion;
    const source = {
      sourceTaskId: sourceTask.value?.id,
      sourceImageId: sourceImageId.value ?? undefined,
      caseId: activeCase.value?.id
    };
    submitting.value = true;
    error.value = "";
    try {
      const snapshot = {
        prompt: prompt.value.trim(),
        mode: mode.value,
        size: size.value,
        n: count.value,
        generationTargetId: targetId.value
      };
      const selectedReferences = snapshot.mode === "image2image" ? [...references.value] : [];
      const files = selectedReferences.filter((item) => item.file);
      let uploaded: ImageAttachment[] = [];
      if (files.length) {
        submitPhase.value = "uploading";
        const form = new FormData();
        files.forEach((item) => form.append("files", item.file!));
        uploaded = (
          await apiFetch<{ images: ImageAttachment[] }>("/uploads", { method: "POST", body: form })
        ).images;
      }
      if (!isCurrent()) return;
      let fileIndex = 0;
      const referenceIds = selectedReferences
        .map((item) => item.image?.id ?? uploaded[fileIndex++]?.id)
        .filter((id): id is string => Boolean(id));
      if (referenceIds.length !== selectedReferences.length)
        throw new Error(t("studio.requestFailed"));
      submitPhase.value = "submitting";
      const result = await apiFetch<{ taskId: string }>("/generate", {
        method: "POST",
        body: JSON.stringify({
          ...snapshot,
          referenceImageIds: referenceIds,
          sourceTaskId: source.sourceTaskId,
          sourceImageId: source.sourceImageId,
          generationEvent: tracking.buildSubmitGenerationEvent({
            promptSource: "user",
            selectedCaseId: source.caseId,
            ...snapshot,
            referenceImageCount: referenceIds.length
          })
        })
      });
      if (auth.user?.id === userId) {
        // 请求已被服务端接受时登记全局任务，但不抢回用户已离开的页面。
        void activity.observeTask(result.taskId);
        void activity.refreshQuota();
      }
      if (!isCurrent()) return;
      // 只有提交成功才将本地文件替换为服务端引用，失败时原输入和参考图仍可重试。
      let uploadedIndex = 0;
      references.value = references.value.map((item) => {
        if (!item.file || snapshot.mode !== "image2image") return item;
        const image = uploaded[uploadedIndex++];
        if (!image) return item;
        URL.revokeObjectURL(item.url);
        return { key: image.id, image, url: image.url, name: item.name };
      });
      mobileTab.value = "results";
      await router.push({ path: "/ai-image", query: { task: result.taskId } });
    } catch (cause) {
      if (isCurrent()) error.value = apiMessage(cause, t("studio.requestFailed"));
    } finally {
      if (request === submissionVersion) {
        submitting.value = false;
        submitPhase.value = "submitting";
      }
    }
  }
  async function cancelCurrent() {
    if (!currentTask.value?.canCancel) return;
    if (await activity.cancel(currentTask.value.id)) await refreshCurrentTask();
  }
  async function retryCurrent() {
    if (!currentTask.value || submitting.value) return;
    const userId = auth.user?.id;
    const request = ++submissionVersion;
    const viewVersion = routeVersion;
    const isCurrent = () =>
      !disposed &&
      auth.user?.id === userId &&
      request === submissionVersion &&
      viewVersion === routeVersion;
    submitting.value = true;
    try {
      const result = await apiFetch<{ taskId: string }>(
        `/tasks/${encodeURIComponent(currentTask.value.id)}/retry`,
        { method: "POST", body: JSON.stringify({ generationEvent: { route: "/ai-image" } }) }
      );
      if (auth.user?.id === userId) {
        void activity.observeTask(result.taskId);
        void activity.refreshQuota();
      }
      if (!isCurrent()) return;
      await router.push({ path: "/ai-image", query: { task: result.taskId } });
      mobileTab.value = "results";
    } catch (cause) {
      if (isCurrent()) error.value = apiMessage(cause, t("studio.requestFailed"));
    } finally {
      if (request === submissionVersion) submitting.value = false;
    }
  }
  async function syncRoute() {
    const key = route.fullPath;
    if (key === loadedRouteKey) return;
    const version = ++routeVersion;
    const userId = auth.user?.id;
    const isCurrent = () => !disposed && version === routeVersion && userId === auth.user?.id;
    const taskId = typeof route.query.task === "string" ? route.query.task : null;
    const sourceId = typeof route.query.sourceTask === "string" ? route.query.sourceTask : null;
    const caseId = typeof route.params.caseId === "string" ? route.params.caseId : null;
    if (taskId && currentTask.value?.id !== taskId) currentTask.value = null;
    error.value = "";
    loadingTask.value = Boolean(taskId || sourceId || caseId);
    try {
      if (taskId || sourceId) {
        const task = await getTask((taskId || sourceId)!);
        if (!isCurrent()) return;
        if (sourceId) {
          const imageId = typeof route.query.image === "string" ? route.query.image : null;
          const image = imageId ? task.images.find((item) => item.id === imageId) : task.images[0];
          if (route.query.reuse === "reference" && !image)
            throw new Error(t("studio.sourceMissing"));
          await reuseTask(task, route.query.reuse === "reference", image);
        } else {
          currentTask.value = task;
          selectedImageId.value = task.images[0]?.id ?? null;
          mobileTab.value = "results";
          comparisonSourceTask.value = null;
          if (task.params.sourceTaskId) {
            void getTask(task.params.sourceTaskId)
              .then((source) => {
                if (isCurrent()) comparisonSourceTask.value = source;
              })
              .catch(() => undefined);
          }
        }
      } else if (caseId && caseId !== appliedCaseId) {
        await applyCase(caseId, false, version);
      }
      loadedRouteKey = key;
    } catch (cause) {
      if (isCurrent()) error.value = apiMessage(cause, t("studio.loadFailed"));
    } finally {
      if (version === routeVersion) loadingTask.value = false;
    }
  }
  watch(
    () => route.fullPath,
    () => {
      void syncRoute();
    },
    { immediate: true }
  );
  watch(
    () => auth.user?.id,
    () => {
      // 撤销缓存、参考图、助手需求与来源标识全部属于账号，不能通过撤销或迟到请求带到下一账号。
      routeVersion += 1;
      submissionVersion += 1;
      clearReferences();
      prompt.value = "";
      undoPrompt.value = null;
      brief.value = emptyCreativeBrief();
      currentTask.value = null;
      sourceTask.value = null;
      comparisonSourceTask.value = null;
      restoredReferenceCount.value = 0;
      sourceImageId.value = null;
      selectedImageId.value = null;
      comparisonImageId.value = null;
      viewerImage.value = null;
      comparing.value = false;
      loadingTask.value = false;
      preparingReferences.value = false;
      submitting.value = false;
      error.value = "";
      notice.value = "";
      loadedRouteKey = "";
      appliedCaseId = null;
      casePickerOpen.value = false;
      cases.startBlankCase();
      socket.disconnect();
    }
  );
  onBeforeUnmount(() => {
    disposed = true;
    routeVersion += 1;
    clearReferences();
    if (refreshTimer) clearTimeout(refreshTimer);
    socket.disconnect();
  });
  return {
    t,
    auth,
    activity,
    prompt,
    undoPrompt,
    brief,
    briefText,
    mode,
    targetId,
    size,
    count,
    references,
    editorTab,
    mobileTab,
    casePickerOpen,
    cases,
    activeCase,
    targets,
    provider,
    supportedModes,
    sizeOptions,
    referenceLimit,
    imageLimit,
    currentTask,
    sourceTask,
    selectedImageId,
    selectedImage,
    images,
    comparisonImageId,
    comparisonImages,
    comparisonImage,
    comparing,
    viewerImage,
    submitting,
    preparingReferences,
    submitPhase,
    loadingTask,
    error,
    notice,
    issueMessage,
    missingReferences,
    acceptCurrentReferences: () => {
      restoredReferenceCount.value = 0;
    },
    canSubmit,
    isRunning,
    referenceDescription,
    referenceContextKey,
    replacePrompt,
    undo,
    addBriefToPrompt,
    applyAssistant,
    addFiles,
    removeReference,
    openCases,
    applyCase,
    newCreation,
    reuseCurrent,
    refreshCurrentTask,
    submit,
    cancelCurrent,
    retryCurrent,
    retryRoute: () => {
      loadedRouteKey = "";
      return syncRoute();
    },
    openTask: (task: GenerationTask) => router.push({ path: "/ai-image", query: { task: task.id } })
  };
}

function apiMessage(cause: unknown, fallback: string) {
  return (
    (cause as { error?: { message?: string } })?.error?.message ??
    (cause instanceof Error ? cause.message : fallback)
  );
}

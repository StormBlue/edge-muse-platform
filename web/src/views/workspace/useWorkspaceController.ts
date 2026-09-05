import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { Image as ImageIcon, Type } from "@lucide/vue";
import { useTaskWebSocket } from "@/composables/useTaskWebSocket";
import { useAuthStore } from "@/stores/auth";
import { getTask } from "@/api/tasks";
import { useTaskActivityStore } from "@/stores/taskActivity";
import { useImageRecreation } from "@/components/image/useImageRecreation";
import { recreationMessages } from "@/components/image/recreationMessages";
import {
  activeGenerationTarget,
  generationTargetDisplayLabel,
  generationTargetsWithFallback
} from "@/utils/generationTargets";
import {
  useSessionStore,
  type ActiveGeneration,
  type ImageAttachment,
  type SessionMode
} from "@/stores/session";
import { useWorkspaceActions } from "./useWorkspaceActions";
import {
  defaultSessionTitle,
  isGeneratingMessage,
  sizeOptionsForProvider,
  type ModeOption
} from "./workspaceOptions";
import {
  latestAssistantResultMessage,
  latestResultImages,
  latestUserPromptMessage
} from "./workspaceMessageSelectors";

export function useWorkspaceController() {
  const route = useRoute();
  const router = useRouter();
  const { t } = useI18n({ useScope: "local", messages: recreationMessages });
  const sessions = useSessionStore();
  const auth = useAuthStore();
  const taskActivity = useTaskActivityStore();
  const { canRecreate: recreationEnabled, recreate } = useImageRecreation();
  const reusePrompt = ref("");
  const reuseReferences = ref<ImageAttachment[]>([]);
  const reuseReferenceCount = ref(0);
  const reuseSettings = ref<{ size: string; n: number; generationTargetId: string } | null>(null);
  const reuseSource = ref<{ sourceTaskId: string; sourceImageId?: string } | null>(null);
  const reuseNotice = ref("");
  const reuseLoading = ref(false);
  const draftVersion = ref(0);
  const now = ref(Date.now());
  let elapsedTimer: ReturnType<typeof setInterval> | null = null;

  const selectedImage = ref<ImageAttachment | null>(null);
  const canRecreate = computed(
    () =>
      recreationEnabled.value &&
      sessions.messages.some(
        (message) =>
          message.role === "assistant" &&
          message.attachments.some((image) => image.id === selectedImage.value?.id)
      )
  );
  const activePreviewImageId = ref<string | null>(null);
  const activeMode = ref<SessionMode>("image2image");
  const generationTargetId = ref("default");
  const draftTitle = ref(defaultSessionTitle());
  const submitting = ref(false);

  const allImages = computed(() =>
    sessions.messages.flatMap((message) => [
      ...message.attachments,
      ...(message.referenceImages ?? [])
    ])
  );
  const resultImages = computed(() => latestResultImages(sessions.messages));
  const activePreviewImage = computed(
    () =>
      resultImages.value.find((image) => image.id === activePreviewImageId.value) ??
      resultImages.value[0] ??
      null
  );

  const runningMessages = computed(() => sessions.messages.filter(isGeneratingMessage));
  const activeRunningMessage = computed(() => {
    const messages = runningMessages.value;
    return messages[messages.length - 1] ?? null;
  });
  const hasRunningTask = computed(() => runningMessages.value.length > 0);
  const latestResultMessage = computed(() => latestAssistantResultMessage(sessions.messages));
  const activeFailedMessage = computed(() => {
    const message = latestResultMessage.value;
    if (!message || hasRunningTask.value) return null;
    return (message.status === "failed" || message.status === "cancelled") &&
      message.attachments.length === 0
      ? message
      : null;
  });

  const promptRecords = computed(() =>
    sessions.messages
      .filter((message) => message.role === "user" && message.prompt)
      .slice(-6)
      .reverse()
  );
  const latestPrompt = computed(() => promptRecords.value[0]?.prompt ?? "");
  const generationProgress = computed(() => {
    const progress = activeRunningMessage.value?.progress;
    if (typeof progress === "number" && progress > 0)
      return Math.min(100, Math.max(0, Math.round(progress * 100)));
    return null;
  });
  const generationElapsed = computed(() => {
    const queuedAt = activeRunningMessage.value?.createdAt;
    if (!queuedAt) return "";
    return t("recreate.elapsed", {
      seconds: Math.max(0, Math.floor((now.value - queuedAt) / 1000))
    });
  });
  const generationStatusLabel = computed(() =>
    activeRunningMessage.value?.status === "queued"
      ? t("common.queued")
      : t("workspace.generationRunning")
  );
  const generationPrompt = computed(() => activeRunningMessage.value?.prompt ?? latestPrompt.value);
  const failedPrompt = computed(() => activeFailedMessage.value?.prompt ?? latestPrompt.value);
  const failedTitle = computed(() =>
    activeFailedMessage.value?.status === "cancelled"
      ? t("recreate.cancelled")
      : activeFailedMessage.value?.error?.code?.startsWith("PROVIDER")
        ? t("workspace.providerGenerationFailed")
        : t("workspace.generationFailed")
  );
  const failedMessage = computed(
    () =>
      (activeFailedMessage.value?.status === "cancelled" ? t("recreate.cancelled") : "") ||
      activeFailedMessage.value?.error?.message ||
      failedPrompt.value ||
      t("workspace.generationFailedHint")
  );
  const inputLoading = computed(() => submitting.value || sessions.loading || reuseLoading.value);
  const latestUserMessage = computed(() => latestUserPromptMessage(sessions.messages));
  const oneShotTaskLocked = computed(() =>
    sessions.messages.some((message) => message.role === "assistant" && Boolean(message.taskId))
  );
  const taskInputMode = computed<SessionMode>({
    get: () => {
      if (oneShotTaskLocked.value && latestUserMessage.value?.referenceImageIds.length) {
        return "image2image";
      }
      return activeMode.value;
    },
    set: (mode) => {
      activeMode.value = mode;
    }
  });
  const currentGenerationSettings = computed(
    () =>
      reuseSettings.value ?? {
        size: sessions.currentSession?.settings?.size ?? "auto",
        n: sessions.currentSession?.settings?.n ?? 1,
        generationTargetId:
          sessions.currentSession?.settings?.generationTargetId ?? generationTargetId.value
      }
  );
  const latestReferenceCount = computed(
    () => latestUserMessage.value?.referenceImageIds.length ?? 0
  );
  const latestReferenceImages = computed(() => latestUserMessage.value?.referenceImages ?? []);
  const sessionTitle = computed(() => sessions.currentSession?.title ?? draftTitle.value);
  const canEditTitle = computed(() => !sessions.currentSessionId && !hasRunningTask.value);
  const modeSelectionDisabled = computed(
    () => submitting.value || hasRunningTask.value || oneShotTaskLocked.value
  );
  const allModeOptions = computed<ModeOption[]>(() => [
    { value: "image2image", label: t("workspace.image2image"), icon: ImageIcon },
    { value: "text2image", label: t("workspace.text2image"), icon: Type }
  ]);
  const generationTargets = computed(() =>
    generationTargetsWithFallback(auth.generationTargets, auth.providerCapabilities).map(
      (target) => ({
        ...target,
        label: generationTargetDisplayLabel(target, t)
      })
    )
  );
  const activeTarget = computed(() =>
    activeGenerationTarget(generationTargets.value, generationTargetId.value)
  );
  const providerCapabilities = computed(
    () => activeTarget.value?.providerCapabilities ?? auth.providerCapabilities
  );
  const supportedModes = computed<SessionMode[]>(
    () => providerCapabilities.value?.supportedModes ?? ["image2image", "text2image"]
  );
  const modeOptions = computed(() =>
    allModeOptions.value.filter((option) => supportsMode(option.value))
  );
  const isMicuProvider = computed(
    () => providerCapabilities.value?.requestFormat === "micu_images"
  );
  const providerSizeOptions = computed(() => {
    const options = sizeOptionsForProvider(providerCapabilities.value);
    if (isMicuProvider.value && taskInputMode.value === "image2image") {
      return options.filter((option) => !isMicu4KSize(option.value));
    }
    return options;
  });
  const limitHighResolutionCount = computed(() => isMicuProvider.value);
  const maxReferenceFiles = computed(() => providerCapabilities.value?.maxReferenceImages ?? 5);
  const maxImagesPerGeneration = computed(() => {
    if (auth.isSysadmin) return 200;
    const configured = auth.user?.maxImagesPerGeneration ?? 1;
    return Math.max(1, Math.min(20, Math.floor(configured)));
  });
  const allowCustomImageCount = computed(() => auth.isSysadmin || maxImagesPerGeneration.value > 1);

  let routeLoadVersion = 0;
  let disposed = false;

  const { status, connect, disconnect } = useTaskWebSocket((payload) => {
    sessions.applyTaskEvent(payload);
    const eventType =
      payload && typeof payload === "object" ? (payload as { type?: string }).type : "";
    if (
      eventType === "task.update" &&
      (payload as { task?: { status?: string } }).task?.status === "cancelled"
    )
      disconnect();
    if (eventType === "task.done") {
      auth.bootstrap();
      disconnect();
    }
    if (eventType === "task.failed") {
      const error =
        payload && typeof payload === "object"
          ? (payload as { error?: { message?: string } }).error
          : null;
      toast.error(error?.message || t("workspace.generationFailedHint"));
      disconnect();
    }
  });

  watch(
    () => auth.user?.id,
    () => {
      // 切换账号后不保留前一个账号的来源参数或未完成加载。
      routeLoadVersion += 1;
      disconnect();
      resetWorkspaceDraft();
    },
    { flush: "sync" }
  );

  onMounted(async () => {
    elapsedTimer = setInterval(() => {
      now.value = Date.now();
    }, 1000);
    const version = routeLoadVersion;
    try {
      await sessions.loadSessions(false);
      if (!disposed && version === routeLoadVersion) await loadRouteSession();
    } catch (error) {
      if (!disposed && version === routeLoadVersion) reportLoadError(error);
    }
  });

  onBeforeUnmount(() => {
    if (elapsedTimer) clearInterval(elapsedTimer);
    disposed = true;
    routeLoadVersion += 1;
    sessions.invalidateMessageLoads();
    disconnect();
  });

  watch(
    () => [route.params.sessionId, route.query.sourceTask, route.query.reuse, route.query.image],
    () => void loadRouteSession()
  );

  // 全局轮询只合并当前会话内同 task 的状态，绝不恢复或跳转到别的会话。
  watch(
    () => taskActivity.items,
    (items) => {
      for (const task of items) {
        const message = sessions.messages.find(
          (item) =>
            item.taskId === task.id &&
            item.sessionId === task.sessionId &&
            item.role === "assistant"
        );
        if (!message || !isGeneratingMessage(message)) continue;
        message.status = task.status;
        if (
          task.status === "succeeded" ||
          task.status === "failed" ||
          task.status === "cancelled"
        ) {
          message.attachments = task.images;
          message.progress = task.status === "succeeded" ? 1 : null;
          message.error = task.errorCode
            ? { code: task.errorCode, message: task.errorMessage ?? "" }
            : null;
          if (!sessions.messages.some(isGeneratingMessage)) disconnect();
        }
      }
    },
    { deep: true }
  );

  watch(
    () => sessions.currentSession?.mode,
    (mode) => {
      if (mode) activeMode.value = mode;
      normalizeActiveMode();
    },
    { immediate: true }
  );

  watch(
    () => sessions.currentSession?.settings?.generationTargetId,
    (targetId) => {
      if (targetId && generationTargets.value.some((target) => target.id === targetId)) {
        generationTargetId.value = targetId;
      }
    },
    { immediate: true }
  );

  // 当前用户 key 切换为 Cubence 等受限 provider 后，主动落到可用模式，避免提交后才报错。
  watch(
    () => [supportedModes.value.join("|"), activeMode.value, modeSelectionDisabled.value] as const,
    () => normalizeActiveMode(),
    { immediate: true }
  );

  watch(
    () => generationTargets.value.map((target) => target.id).join("|"),
    () => {
      if (generationTargets.value.some((target) => target.id === generationTargetId.value)) return;
      generationTargetId.value =
        generationTargets.value.find((target) => target.id === "default")?.id ??
        generationTargets.value[0]?.id ??
        "default";
    },
    { immediate: true }
  );

  watch(generationTargetId, () => {
    normalizeActiveMode();
  });

  watch(
    resultImages,
    (images) => {
      if (!images.length) {
        activePreviewImageId.value = null;
        return;
      }
      if (!images.some((image) => image.id === activePreviewImageId.value)) {
        activePreviewImageId.value = images[0]?.id ?? null;
      }
    },
    { immediate: true }
  );

  async function newSession() {
    if (!auth.isSysadmin && hasRunningTask.value) {
      return;
    }
    routeLoadVersion += 1;
    disconnect();
    resetWorkspaceDraft();
    await router.push("/workspace");
  }

  function setActiveMode(mode: SessionMode) {
    if (modeSelectionDisabled.value) return;
    if (!supportsMode(mode)) return;
    activeMode.value = mode;
  }

  function currentRouteSessionId() {
    return typeof route.params.sessionId === "string" ? route.params.sessionId : null;
  }

  async function loadRouteSession() {
    const version = ++routeLoadVersion;
    const routeSessionId = currentRouteSessionId();
    const isCurrent = () => !disposed && version === routeLoadVersion;
    disconnect();
    sessions.invalidateMessageLoads();
    selectedImage.value = null;
    try {
      if (routeSessionId) {
        reusePrompt.value = "";
        reuseReferences.value = [];
        reuseReferenceCount.value = 0;
        reuseSettings.value = null;
        reuseSource.value = null;
        reuseNotice.value = "";
        reuseLoading.value = false;
        draftVersion.value += 1;
        await sessions.loadMessages(routeSessionId);
        if (!isCurrent()) return;
        const running = sessions.messages.find(isGeneratingMessage);
        if (running?.taskId) connect(`/ws/task/${running.taskId}`);
        return;
      }
      resetWorkspaceDraft();
      if (
        typeof route.query.sourceTask === "string" &&
        (route.query.reuse === "params" || route.query.reuse === "reference")
      ) {
        reuseLoading.value = true;
        try {
          const task = await getTask(route.query.sourceTask);
          if (!isCurrent()) return;
          const requestedTarget = task.params.generationTargetId ?? "default";
          generationTargetId.value = generationTargets.value.some(
            (target) => target.id === requestedTarget
          )
            ? requestedTarget
            : generationTargetId.value;
          const requestedMode =
            route.query.reuse === "reference" ? "image2image" : task.params.mode;
          activeMode.value = supportsMode(requestedMode)
            ? requestedMode
            : (supportedModes.value[0] ?? "text2image");
          await nextTick();
          if (!isCurrent()) return;
          const selected = task.images.find((image) => image.id === route.query.image);
          if (route.query.reuse === "reference" && !selected)
            throw new Error("Source image unavailable");
          const originalReferenceIds = new Set(
            task.params.referenceImageIds ?? task.referenceImages.map((image) => image.id)
          );
          const refs =
            route.query.reuse === "reference"
              ? [selected!]
              : task.referenceImages.filter((image) => originalReferenceIds.has(image.id));
          // 以任务参数内的原始引用 ID 为准，不能用成功恢复的图片数量掩盖缺图。
          reuseReferenceCount.value =
            route.query.reuse === "reference" ? 1 : originalReferenceIds.size;
          reuseReferences.value =
            activeMode.value === "image2image" ? refs.slice(0, maxReferenceFiles.value) : [];
          const size = supportsSize(task.params.size)
            ? task.params.size
            : (providerSizeOptions.value[0]?.value ?? "auto");
          const count = Math.min(
            task.params.n,
            maxImagesPerGeneration.value,
            isMicuProvider.value &&
              /^(\d+)x(\d+)$/.test(size) &&
              Math.max(...size.split("x").map(Number)) >= 1600
              ? 1
              : Infinity
          );
          reuseSettings.value = { size, n: count, generationTargetId: generationTargetId.value };
          reusePrompt.value = task.prompt;
          reuseSource.value = {
            sourceTaskId: task.id,
            ...(selected ? { sourceImageId: selected.id } : {})
          };
          reuseNotice.value =
            size !== task.params.size ||
            count !== task.params.n ||
            activeMode.value !== requestedMode ||
            generationTargetId.value !== requestedTarget ||
            refs.length !== reuseReferences.value.length
              ? t("recreate.adjusted")
              : t("recreate.loaded");
          draftVersion.value += 1;
        } finally {
          if (isCurrent()) reuseLoading.value = false;
        }
        return;
      }
      if (auth.isSysadmin) return;
      const active = await sessions.loadActiveGeneration();
      if (!isCurrent() || !active) return;
      await openActiveGeneration(active);
    } catch (error) {
      if (isCurrent()) reportLoadError(error);
    }
  }

  async function openActiveGeneration(active: ActiveGeneration) {
    const version = ++routeLoadVersion;
    await sessions.loadMessages(active.sessionId);
    if (disposed || version !== routeLoadVersion) return;
    connect(`/ws/task/${active.taskId}`);
    if (currentRouteSessionId() !== active.sessionId) {
      await router.replace(`/workspace/s/${active.sessionId}`);
    }
  }

  function reportLoadError(error: unknown) {
    const body = error as { error?: { message?: string } } | null;
    toast.error(body?.error?.message || t("common.failed"));
  }

  function resetWorkspaceDraft() {
    reusePrompt.value = "";
    reuseReferences.value = [];
    reuseReferenceCount.value = 0;
    reuseSettings.value = null;
    reuseSource.value = null;
    reuseNotice.value = "";
    reuseLoading.value = false;
    draftVersion.value += 1;
    sessions.invalidateMessageLoads();
    sessions.currentSessionId = null;
    sessions.messages = [];
    sessions.nextMessageCursor = null;
    activePreviewImageId.value = null;
    selectedImage.value = null;
    activeMode.value = "image2image";
    generationTargetId.value =
      generationTargets.value.find((target) => target.id === "default")?.id ??
      generationTargets.value[0]?.id ??
      "default";
    normalizeActiveMode();
    draftTitle.value = defaultSessionTitle();
  }

  function supportsMode(mode: SessionMode) {
    return supportedModes.value.includes(mode);
  }

  function normalizeActiveMode() {
    if (supportsMode(activeMode.value)) return;
    if (modeSelectionDisabled.value) return;
    activeMode.value = supportedModes.value[0] ?? "image2image";
  }

  function supportsSize(size: string) {
    const sizes = providerCapabilities.value?.supportedSizes;
    if (!sizes?.length || sizes.includes("*")) return true;
    return providerSizeOptions.value.some((option) => option.value === size);
  }

  const { submit, retry, retryFailedResult, openImage, openActivePreview, deleteImageMessage } =
    useWorkspaceActions({
      t,
      router,
      sessions,
      auth,
      connect,
      draftTitle,
      submitting,
      selectedImage,
      hasRunningTask,
      oneShotTaskLocked,
      maxReferenceFiles,
      activeFailedMessage,
      activePreviewImage,
      supportsMode,
      supportsSize,
      openActiveGeneration,
      reuseSource
    });

  return {
    t,
    sessions,
    auth,
    selectedImage,
    activePreviewImageId,
    activeMode,
    draftTitle,
    submitting,
    allImages,
    resultImages,
    activePreviewImage,
    activeFailedMessage,
    latestPrompt,
    generationProgress,
    generationElapsed,
    canRecreate,
    recreate,
    reusePrompt,
    reuseReferences,
    reuseReferenceCount,
    reuseNotice,
    draftVersion,
    generationStatusLabel,
    generationPrompt,
    failedTitle,
    failedMessage,
    inputLoading,
    oneShotTaskLocked,
    taskInputMode,
    currentGenerationSettings,
    latestReferenceCount,
    latestReferenceImages,
    sessionTitle,
    canEditTitle,
    modeSelectionDisabled,
    modeOptions,
    generationTargetId,
    generationTargets,
    providerSizeOptions,
    limitHighResolutionCount,
    maxReferenceFiles,
    maxImagesPerGeneration,
    allowCustomImageCount,
    hasRunningTask,
    status,
    newSession,
    setActiveMode,
    submit,
    retry,
    retryFailedResult,
    openImage,
    openActivePreview,
    deleteImageMessage
  };
}

function isMicu4KSize(size: string): boolean {
  const match = /^(\d+)x(\d+)$/i.exec(size);
  if (!match) return false;
  return Math.max(Number(match[1]), Number(match[2])) >= 3000;
}

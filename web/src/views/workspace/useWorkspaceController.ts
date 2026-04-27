import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { useRoute, useRouter } from "vue-router";
import { toast } from "vue-sonner";
import { Image as ImageIcon, MessageSquare, Type } from "lucide-vue-next";
import { useTaskWebSocket } from "@/composables/useTaskWebSocket";
import { useAuthStore } from "@/stores/auth";
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

export function useWorkspaceController() {
  const route = useRoute();
  const router = useRouter();
  const { t } = useI18n();
  const sessions = useSessionStore();
  const auth = useAuthStore();

  const selectedImage = ref<ImageAttachment | null>(null);
  const activePreviewImageId = ref<string | null>(null);
  const activeMode = ref<SessionMode>("text2image");
  const draftTitle = ref(defaultSessionTitle());
  const submitting = ref(false);
  const messageList = ref<HTMLElement | null>(null);
  const topSentinel = ref<HTMLElement | null>(null);

  const allImages = computed(() =>
    sessions.messages.flatMap((message) => [
      ...message.attachments,
      ...(message.referenceImages ?? [])
    ])
  );
  const resultImages = computed(() => {
    for (let index = sessions.messages.length - 1; index >= 0; index -= 1) {
      const message = sessions.messages[index];
      if (message?.attachments.length) return message.attachments;
    }
    return [];
  });
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
  const latestResultMessage = computed(() => {
    for (let index = sessions.messages.length - 1; index >= 0; index -= 1) {
      const message = sessions.messages[index];
      if (message?.role === "assistant" && (message.taskId || message.attachments.length)) {
        return message;
      }
    }
    return null;
  });
  const activeFailedMessage = computed(() => {
    const message = latestResultMessage.value;
    if (!message || hasRunningTask.value) return null;
    return message.status === "failed" && message.attachments.length === 0 ? message : null;
  });

  const isConversationMode = computed(() => activeMode.value === "chat");
  const promptRecords = computed(() =>
    sessions.messages
      .filter((message) => message.role === "user" && message.prompt)
      .slice(-6)
      .reverse()
  );
  const latestPrompt = computed(() => promptRecords.value[0]?.prompt ?? "");
  const generationProgress = computed(() => {
    const progress = activeRunningMessage.value?.progress;
    if (typeof progress === "number") return Math.min(99, Math.max(6, Math.round(progress * 100)));
    return activeRunningMessage.value?.status === "queued" ? 6 : 28;
  });
  const generationStatusLabel = computed(() =>
    activeRunningMessage.value?.status === "queued"
      ? t("common.queued")
      : t("workspace.generationRunning")
  );
  const generationPrompt = computed(() => activeRunningMessage.value?.prompt ?? latestPrompt.value);
  const failedPrompt = computed(() => activeFailedMessage.value?.prompt ?? latestPrompt.value);
  const failedTitle = computed(() =>
    activeFailedMessage.value?.error?.code?.startsWith("PROVIDER")
      ? t("workspace.providerGenerationFailed")
      : t("workspace.generationFailed")
  );
  const failedMessage = computed(
    () =>
      activeFailedMessage.value?.error?.message ||
      failedPrompt.value ||
      t("workspace.generationFailedHint")
  );
  const inputLoading = computed(() => submitting.value || sessions.loading);
  const latestUserMessage = computed(() => {
    for (let index = sessions.messages.length - 1; index >= 0; index -= 1) {
      const message = sessions.messages[index];
      if (message?.role === "user" && message.prompt) return message;
    }
    return null;
  });
  const oneShotTaskLocked = computed(
    () =>
      activeMode.value !== "chat" &&
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
  const currentGenerationSettings = computed(() => ({
    size: sessions.currentSession?.settings?.size ?? "1024x1024",
    n: sessions.currentSession?.settings?.n ?? 1
  }));
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
    { value: "text2image", label: t("workspace.text2image"), icon: Type },
    { value: "image2image", label: t("workspace.image2image"), icon: ImageIcon },
    { value: "chat", label: t("workspace.continuousChat"), icon: MessageSquare }
  ]);
  const providerCapabilities = computed(() => auth.providerCapabilities);
  const supportedModes = computed<SessionMode[]>(
    () => providerCapabilities.value?.supportedModes ?? ["text2image", "image2image", "chat"]
  );
  const modeOptions = computed(() =>
    allModeOptions.value.filter((option) => supportsMode(option.value))
  );
  const providerSizeOptions = computed(() => sizeOptionsForProvider(providerCapabilities.value));
  const maxReferenceFiles = computed(() => providerCapabilities.value?.maxReferenceImages ?? 5);

  let messageObserver: IntersectionObserver | null = null;
  let restoringActiveGeneration = false;

  const { status, connect, disconnect } = useTaskWebSocket((payload) => {
    sessions.applyTaskEvent(payload);
    const eventType =
      payload && typeof payload === "object" ? (payload as { type?: string }).type : "";
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

  onMounted(async () => {
    // 先拉会话列表，再尝试恢复中断任务或按路由加载消息。
    await sessions.loadSessions();
    const restored = await restoreActiveGenerationIfNeeded();
    const routeSessionId = currentRouteSessionId();
    if (!restored && routeSessionId) {
      await sessions.loadMessages(routeSessionId);
    } else if (!restored) {
      resetWorkspaceDraft();
    }
    await nextTick();
    setupMessageObserver();
  });

  onBeforeUnmount(() => {
    messageObserver?.disconnect();
  });

  watch(
    () => route.params.sessionId,
    async (id) => {
      if (restoringActiveGeneration) return;
      const restored = await restoreActiveGenerationIfNeeded();
      if (restored) return;
      if (typeof id === "string") {
        await sessions.loadMessages(id);
      } else {
        resetWorkspaceDraft();
      }
    }
  );

  watch(
    () => sessions.currentSession?.mode,
    (mode) => {
      if (mode) activeMode.value = mode;
      normalizeActiveMode();
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

  watch(isConversationMode, async (enabled) => {
    if (!enabled) return;
    await nextTick();
    setupMessageObserver();
  });

  async function newSession() {
    if (!auth.isSysadmin && hasRunningTask.value) {
      await restoreActiveGenerationIfNeeded();
      return;
    }
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

  /**
   * 刷新进入时恢复 queued/running 任务：拉消息、连 WS，并把路由修正到真实会话。
   * sysadmin 可多任务并行，不主动抢占到某一个进行中任务。
   */
  async function restoreActiveGenerationIfNeeded() {
    if (auth.isSysadmin || restoringActiveGeneration) return false;
    const active = await sessions.loadActiveGeneration();
    if (!active) return false;
    await openActiveGeneration(active);
    return true;
  }

  async function openActiveGeneration(active: ActiveGeneration) {
    restoringActiveGeneration = true;
    try {
      await sessions.loadMessages(active.sessionId);
      connect(`/ws/task/${active.taskId}`);
      if (currentRouteSessionId() !== active.sessionId) {
        await router.replace(`/workspace/s/${active.sessionId}`);
      }
    } finally {
      restoringActiveGeneration = false;
    }
  }

  function resetWorkspaceDraft() {
    sessions.currentSessionId = null;
    sessions.messages = [];
    sessions.nextMessageCursor = null;
    activePreviewImageId.value = null;
    selectedImage.value = null;
    activeMode.value = "text2image";
    normalizeActiveMode();
    draftTitle.value = defaultSessionTitle();
  }

  function supportsMode(mode: SessionMode) {
    return supportedModes.value.includes(mode);
  }

  function normalizeActiveMode() {
    if (supportsMode(activeMode.value)) return;
    if (modeSelectionDisabled.value) return;
    activeMode.value = supportedModes.value[0] ?? "text2image";
  }

  function supportsSize(size: string) {
    const sizes = providerCapabilities.value?.supportedSizes;
    if (!sizes?.length || sizes.includes("*")) return true;
    return sizes.includes(size);
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
      openActiveGeneration
    });

  function setupMessageObserver() {
    messageObserver?.disconnect();
    if (!topSentinel.value || !messageList.value) return;
    messageObserver = new IntersectionObserver(
      async ([entry]) => {
        if (!entry?.isIntersecting || !sessions.nextMessageCursor) return;
        const list = messageList.value;
        const previousHeight = list?.scrollHeight ?? 0;
        await sessions.loadOlderMessages();
        await nextTick();
        if (list) list.scrollTop += list.scrollHeight - previousHeight;
      },
      { root: messageList.value, rootMargin: "160px 0px 0px 0px" }
    );
    messageObserver.observe(topSentinel.value);
  }

  return {
    t,
    sessions,
    auth,
    selectedImage,
    activePreviewImageId,
    activeMode,
    draftTitle,
    submitting,
    messageList,
    topSentinel,
    allImages,
    resultImages,
    activePreviewImage,
    activeFailedMessage,
    isConversationMode,
    latestPrompt,
    generationProgress,
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
    providerSizeOptions,
    maxReferenceFiles,
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

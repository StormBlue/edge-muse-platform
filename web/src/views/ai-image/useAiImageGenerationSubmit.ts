/**
 * AI 图像生成页的提交链路。
 *
 * 复用现有 `/api/uploads`、`/api/generate`、WebSocket 和 session store；本页只负责更友好的 prompt 准备。
 */
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useI18n } from "vue-i18n";
import { toast } from "vue-sonner";
import { apiFetch } from "@/api/client";
import { useTaskWebSocket } from "@/composables/useTaskWebSocket";
import { useAuthStore } from "@/stores/auth";
import { useSessionStore, type ImageAttachment, type Message } from "@/stores/session";
import { imageFilesFromFileList, prepareReferenceImageFiles } from "@/utils/referenceImageFiles";
import { imagesForAiImageActiveResult } from "./aiImageResultScope";
import {
  getAiImageSubmitBlockReason,
  type AiImageSubmitBlockReason
} from "./aiImageSubmitValidation";
import { defaultSessionTitle, sizeOptionsForProvider } from "@/views/workspace/workspaceOptions";
import type { PromptCaseMode } from "@/types/promptCases";

export type AiImageSubmitGenerationEvent = {
  route?: string;
  caseId?: string;
  metadata?: Record<string, unknown>;
};

export function useAiImageGenerationSubmit() {
  const { t } = useI18n();
  const auth = useAuthStore();
  const sessions = useSessionStore();
  const mode = ref<PromptCaseMode>("text2image");
  const size = ref("1024x1024");
  const files = ref<File[]>([]);
  const previews = ref<Array<{ file: File; url: string }>>([]);
  const submitting = ref(false);
  const activeTaskId = ref<string | null>(null);
  const activeSessionId = ref<string | null>(null);

  const sizeOptions = computed(() => sizeOptionsForProvider(auth.providerCapabilities));
  const supportedModes = computed(() =>
    (auth.providerCapabilities?.supportedModes ?? ["text2image", "image2image"]).filter(
      (item): item is PromptCaseMode => item === "text2image" || item === "image2image"
    )
  );
  const maxReferenceFiles = computed(() => auth.providerCapabilities?.maxReferenceImages ?? 5);
  const runningMessages = computed(() =>
    sessions.messages.filter(
      (message) => message.status === "queued" || message.status === "running"
    )
  );
  const hasRunningTask = computed(() => runningMessages.value.length > 0);
  const resultImages = computed(() =>
    imagesForAiImageActiveResult(sessions.messages, {
      taskId: activeTaskId.value,
      sessionId: activeSessionId.value
    })
  );
  const activeResultMessage = computed(() =>
    findAiImageActiveResultMessage(sessions.messages, {
      taskId: activeTaskId.value,
      sessionId: activeSessionId.value
    })
  );
  const activeFailedMessage = computed(() => {
    const message = activeResultMessage.value;
    if (!message || hasRunningTask.value) return null;
    return message.status === "failed" ? message : null;
  });
  const activeFailed = computed(() => Boolean(activeFailedMessage.value));
  const activeRunningMessage = computed(() => {
    const messages = runningMessages.value;
    return messages[messages.length - 1] ?? null;
  });
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
  const generationPrompt = computed(() => activeRunningMessage.value?.prompt ?? "");
  const failedTitle = computed(() =>
    activeFailedMessage.value?.error?.code?.startsWith("PROVIDER")
      ? t("workspace.providerGenerationFailed")
      : t("workspace.generationFailed")
  );
  const failedMessage = computed(
    () =>
      activeFailedMessage.value?.error?.message ||
      activeFailedMessage.value?.prompt ||
      t("workspace.generationFailedHint")
  );

  const { status, connect, disconnect } = useTaskWebSocket((payload) => {
    sessions.applyTaskEvent(payload);
    const type = payload && typeof payload === "object" ? (payload as { type?: string }).type : "";
    if (type === "task.done") {
      void auth.bootstrap();
      disconnect();
    }
    if (type === "task.failed") {
      toast.error(t("workspace.generationFailedHint"));
      disconnect();
    }
  });

  watch(
    () => sizeOptions.value.map((option) => option.value).join("|"),
    () => {
      if (sizeOptions.value.some((option) => option.value === size.value)) return;
      size.value = sizeOptions.value[0]?.value ?? "1024x1024";
    },
    { immediate: true }
  );

  watch(mode, (next) => {
    if (next === "text2image") clearFiles();
  });

  watch(files, (next) => {
    for (const preview of previews.value) URL.revokeObjectURL(preview.url);
    previews.value = next.map((file) => ({ file, url: URL.createObjectURL(file) }));
  });

  onBeforeUnmount(() => {
    disconnect();
    for (const preview of previews.value) URL.revokeObjectURL(preview.url);
  });

  async function addFiles(input: FileList | File[]) {
    const prepared = await prepareReferenceImageFiles(imageFilesFromFileList(input));
    files.value = [...files.value, ...prepared].slice(0, Math.max(1, maxReferenceFiles.value));
  }

  function removeFile(index: number) {
    files.value = files.value.filter((_, currentIndex) => currentIndex !== index);
  }

  function clearFiles() {
    files.value = [];
  }

  async function submit(
    prompt: string,
    title?: string,
    generationEvent?: AiImageSubmitGenerationEvent
  ) {
    const trimmed = prompt.trim();
    const blockReason = getAiImageSubmitBlockReason({
      prompt: trimmed,
      submitting: submitting.value,
      hasRunningTask: hasRunningTask.value,
      mode: mode.value,
      supportedModes: supportedModes.value,
      size: size.value,
      sizeOptions: sizeOptions.value,
      referenceImageCount: files.value.length
    });
    if (blockReason) {
      toast.error(submitBlockMessage(blockReason));
      return { submitted: false as const, reason: blockReason };
    }

    submitting.value = true;
    activeTaskId.value = null;
    activeSessionId.value = null;
    try {
      const uploaded = await uploadReferencesIfNeeded();
      // AI 图像生成页每次提交独立创建会话，避免误写入用户刚才在专业工作台打开的会话。
      sessions.currentSessionId = null;
      const task = await sessions.generate({
        title: title || defaultSessionTitle(),
        prompt: trimmed,
        mode: mode.value,
        size: size.value,
        n: 1,
        referenceImageIds: uploaded.referenceImageIds,
        referenceImages: uploaded.referenceImages,
        generationEvent
      });
      activeTaskId.value = task.taskId;
      activeSessionId.value = task.sessionId;
      connect(task.wsUrl);
      toast.success(t("aiImage.submitted"));
      if (mode.value === "image2image") clearFiles();
      return { submitted: true as const, taskId: task.taskId };
    } catch (error) {
      const message =
        error && typeof error === "object" && "error" in error
          ? (error as { error: { message: string } }).error.message
          : t("workspace.submitFailed");
      toast.error(message);
      return { submitted: false as const, reason: "request_failed" as const };
    } finally {
      submitting.value = false;
    }
  }

  async function retry(generationEvent?: AiImageSubmitGenerationEvent) {
    const failed = activeFailedMessage.value;
    if (!failed?.taskId || submitting.value || hasRunningTask.value) return;
    submitting.value = true;
    try {
      const body = await apiFetch<{ taskId: string; sessionId: string; messageId: string }>(
        `/tasks/${failed.taskId}/retry`,
        {
          method: "POST",
          body: JSON.stringify({
            generationEvent: {
              route: generationEvent?.route ?? "/ai-image",
              caseId: generationEvent?.caseId,
              metadata: {
                ...generationEvent?.metadata,
                isRetry: true,
                retryTrigger: "ai-image"
              }
            }
          })
        }
      );
      const createdAt = Date.now();
      sessions.messages.push({
        id: `local-retry-${createdAt}`,
        sessionId: body.sessionId,
        role: "user",
        prompt: failed.prompt,
        attachments: [],
        referenceImages: findSourceReferenceImages(failed),
        referenceImageIds: findSourceReferenceImageIds(failed),
        status: "succeeded",
        createdAt
      });
      sessions.messages.push({
        id: body.messageId,
        sessionId: body.sessionId,
        role: "assistant",
        prompt: failed.prompt,
        attachments: [],
        referenceImageIds: [],
        taskId: body.taskId,
        status: "queued",
        progress: 0,
        createdAt: createdAt + 1
      });
      activeTaskId.value = body.taskId;
      activeSessionId.value = body.sessionId;
      connect(`/ws/task/${body.taskId}`);
    } catch (error) {
      const message =
        error && typeof error === "object" && "error" in error
          ? (error as { error: { message: string } }).error.message
          : t("workspace.submitFailed");
      toast.error(message);
    } finally {
      submitting.value = false;
    }
  }

  async function uploadReferencesIfNeeded() {
    if (mode.value !== "image2image" || !files.value.length) {
      return { referenceImageIds: [] as string[], referenceImages: [] as ImageAttachment[] };
    }
    const form = new FormData();
    files.value.forEach((file) => form.append("files", file));
    const body = await apiFetch<{ images: ImageAttachment[] }>("/uploads", {
      method: "POST",
      body: form
    });
    return {
      referenceImageIds: body.images.map((image) => image.id),
      referenceImages: body.images
    };
  }

  function submitBlockMessage(reason: AiImageSubmitBlockReason) {
    if (reason === "empty_prompt") return t("workspace.emptyPrompt");
    if (reason === "mode_unsupported") return t("workspace.modeUnsupported");
    if (reason === "size_unsupported") return t("workspace.sizeUnsupported");
    if (reason === "reference_required") return t("workspace.referenceRequired");
    if (reason === "submitting") return t("workspace.submitting");
    return t("workspace.generationRunning");
  }

  function findSourceReferenceImageIds(message: Message) {
    return findSourceUserMessage(message)?.referenceImageIds ?? [];
  }

  function findSourceReferenceImages(message: Message) {
    return findSourceUserMessage(message)?.referenceImages ?? [];
  }

  function findSourceUserMessage(message: Message) {
    const messageIndex = sessions.messages.findIndex((item) => item.id === message.id);
    const endIndex = messageIndex >= 0 ? messageIndex - 1 : sessions.messages.length - 1;
    for (let index = endIndex; index >= 0; index -= 1) {
      const candidate = sessions.messages[index];
      if (candidate?.sessionId === message.sessionId && candidate.role === "user") return candidate;
    }
    return null;
  }

  return {
    activeFailed,
    activeFailedMessage,
    failedMessage,
    failedTitle,
    files,
    generationProgress,
    generationPrompt,
    generationStatusLabel,
    hasRunningTask,
    maxReferenceFiles,
    mode,
    previews,
    resultImages,
    sessions,
    size,
    sizeOptions,
    status,
    submitting,
    supportedModes,
    addFiles,
    clearFiles,
    removeFile,
    retry,
    submit
  };
}

function findAiImageActiveResultMessage(
  messages: Message[],
  scope: { taskId: string | null; sessionId: string | null }
) {
  if (!scope.taskId && !scope.sessionId) return null;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (!message || message.role !== "assistant") continue;
    if (scope.taskId && message.taskId === scope.taskId) return message;
    if (scope.sessionId && message.sessionId === scope.sessionId && message.taskId) return message;
  }
  return null;
}
